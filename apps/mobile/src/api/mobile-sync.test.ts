import { pullMobileSync, pushMobileSync } from "./mobile-sync";

const accountChange = {
  entityType: "account",
  entityId: "account-1",
  revision: 1,
  operation: "upsert",
  serverUpdatedAt: "2026-08-13 14:00:00",
  payload: {
    id: "account-1",
    name: "Wallet",
    type: "cash",
    currency: "PHP",
    archived: false,
    system: false,
    interest: {
      enabled: false,
      annualRateBasisPoints: null,
      frequency: null,
      payDay: null,
    },
    revision: 1,
    updatedAt: "2026-08-13 14:00:00",
  },
};

describe("fixed mobile synchronization transport", () => {
  it("sends only the bearer token and cursor to the fixed Worker route", async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            changes: [accountChange],
            nextCursor: "v1.1",
            hasMore: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      pullMobileSync({ accessToken: "token", cursor: null, fetchImpl }),
    ).resolves.toMatchObject({ nextCursor: "v1.1" });
    const request = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(request[0].pathname).toBe("/api/app/sync/pull");
    expect(request[1].method).toBe("POST");
    expect(new Headers(request[1].headers).get("Authorization")).toBe("Bearer token");
    expect(request[1].body).toBe(JSON.stringify({ protocolVersion: 1, cursor: null, limit: 100 }));
    expect(request[1].body).not.toContain("tenant");
  });

  it("pushes a validated outbox batch only to the fixed Worker route", async () => {
    const request = {
      protocolVersion: 1 as const,
      clientId: "00000000-0000-4000-8000-000000000001",
      operations: [
        {
          operationId: "00000000-0000-4000-8000-000000000002",
          idempotencyKey: "00000000-0000-4000-8000-000000000003",
          entityType: "transaction" as const,
          entityId: "00000000-0000-4000-8000-000000000004",
          operationType: "delete" as const,
          baseRevision: 2,
          dependencyIds: [],
          payload: {},
        },
      ],
    };
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            protocolVersion: 1,
            results: [
              {
                operationId: request.operations[0]!.operationId,
                entityType: "transaction",
                entityId: request.operations[0]!.entityId,
                status: "acknowledged",
                revision: 3,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      pushMobileSync({ accessToken: "token", request, fetchImpl }),
    ).resolves.toMatchObject({ results: [{ status: "acknowledged", revision: 3 }] });
    const call = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(call[0].pathname).toBe("/api/app/sync/push");
    expect(call[1].method).toBe("POST");
    expect(new Headers(call[1].headers).get("Authorization")).toBe("Bearer token");
    expect(call[1].body).not.toContain("tenant");
  });

  it("classifies idempotency mismatch without discarding the local operation", async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "idempotency_key_reused" }), { status: 409 }),
      ),
    );
    await expect(
      pushMobileSync({
        accessToken: "token",
        request: {
          protocolVersion: 1,
          clientId: "00000000-0000-4000-8000-000000000001",
          operations: [
            {
              operationId: "00000000-0000-4000-8000-000000000002",
              idempotencyKey: "00000000-0000-4000-8000-000000000003",
              entityType: "transaction",
              entityId: "00000000-0000-4000-8000-000000000004",
              operationType: "delete",
              baseRevision: 2,
              dependencyIds: [],
              payload: {},
            },
          ],
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "idempotency_mismatch" });
  });

  it.each([
    [401, "session_expired"],
    [410, "account_deleted"],
    [429, "rate_limited"],
    [503, "retryable"],
  ])("classifies HTTP %i without accepting its body", async (status, code) => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(new Response("{}", { status, headers: { "Retry-After": "7" } })),
    );
    await expect(
      pullMobileSync({ accessToken: "token", cursor: null, fetchImpl }),
    ).rejects.toMatchObject({ code });
  });

  it("recognizes a typed full-resync response", async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "full_resync_required" }), { status: 409 }),
      ),
    );
    await expect(
      pullMobileSync({ accessToken: "token", cursor: "v1.z", fetchImpl }),
    ).rejects.toMatchObject({ code: "full_resync_required" });
  });

  it("preserves abort signals so the coordinator can distinguish cancellation", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const fetchImpl = jest.fn(() => Promise.reject(abort));
    await expect(
      pushMobileSync({
        accessToken: "token",
        request: {
          protocolVersion: 1,
          clientId: "00000000-0000-4000-8000-000000000001",
          operations: [
            {
              operationId: "00000000-0000-4000-8000-000000000002",
              idempotencyKey: "00000000-0000-4000-8000-000000000003",
              entityType: "transaction",
              entityId: "00000000-0000-4000-8000-000000000004",
              operationType: "delete",
              baseRevision: 2,
              dependencyIds: [],
              payload: {},
            },
          ],
        },
        fetchImpl,
      }),
    ).rejects.toBe(abort);
  });

  it("rejects invalid and oversized response bodies", async () => {
    const invalid = jest.fn(() => Promise.resolve(new Response("not-json", { status: 200 })));
    const oversized = jest.fn(() =>
      Promise.resolve(
        new Response("x", { status: 200, headers: { "Content-Length": String(600 * 1024) } }),
      ),
    );
    await expect(
      pullMobileSync({ accessToken: "token", cursor: null, fetchImpl: invalid }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      pullMobileSync({ accessToken: "token", cursor: null, fetchImpl: oversized }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
