jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { verifyWorkerIdentity, type WorkerIdentityError } from "./worker-identity";

const subject = "123e4567-e89b-12d3-a456-426614174000";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Worker identity verification", () => {
  it("accepts only the Worker-derived tenant for the Supabase subject", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(
        jsonResponse({
          user: { id: subject, email: "don@example.com", role: "authenticated" },
          tenantId: `user:${subject}`,
        }),
      ),
    );

    await expect(
      verifyWorkerIdentity({ subject, accessToken: "access-token", fetchImpl }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://api.zoption.test/api/app/me"),
      expect.objectContaining({ method: "GET" }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("fails closed when the Worker identity does not match the session", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(
        jsonResponse({
          user: { id: "123e4567-e89b-12d3-a456-426614174001" },
          tenantId: "user:123e4567-e89b-12d3-a456-426614174001",
        }),
      ),
    );

    await expect(
      verifyWorkerIdentity({ subject, accessToken: "access-token", fetchImpl }),
    ).rejects.toMatchObject<Partial<WorkerIdentityError>>({ code: "identity_mismatch" });
  });

  it("classifies expired sessions without decoding the token client-side", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ error: "invalid" }, 401)),
    );
    await expect(
      verifyWorkerIdentity({ subject, accessToken: "expired", fetchImpl }),
    ).rejects.toMatchObject<Partial<WorkerIdentityError>>({
      code: "session_expired",
      status: 401,
    });
  });

  it("rejects malformed success payloads", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ tenantId: `user:${subject}` })),
    );
    await expect(
      verifyWorkerIdentity({ subject, accessToken: "access-token", fetchImpl }),
    ).rejects.toMatchObject<Partial<WorkerIdentityError>>({ code: "invalid_response" });
  });
});
