jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { readPlan, type PlanError } from "./plan";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("plan reading", () => {
  it("reads the server-authoritative plan from the billing summary", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ plan: "zoption_pro", entitlementSource: "paypal" })),
    );

    await expect(readPlan({ accessToken: "access-token", fetchImpl })).resolves.toBe("zoption_pro");
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://api.zoption.test/api/app/billing"),
      expect.objectContaining({ method: "GET" }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("defaults the Free plan from a full summary payload", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ plan: "free", entitlementSource: null })),
    );

    await expect(readPlan({ accessToken: "access-token", fetchImpl })).resolves.toBe("free");
  });

  it("classifies expired sessions", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ error: "invalid" }, 401)),
    );
    await expect(
      readPlan({ accessToken: "expired", fetchImpl }),
    ).rejects.toMatchObject<Partial<PlanError>>({ code: "session_expired", status: 401 });
  });

  it("rejects a malformed summary that lacks a known plan", async () => {
    const fetchImpl = jest.fn<Promise<Response>, [URL | RequestInfo, RequestInit?]>(() =>
      Promise.resolve(jsonResponse({ plan: "business" })),
    );
    await expect(
      readPlan({ accessToken: "access-token", fetchImpl }),
    ).rejects.toMatchObject<Partial<PlanError>>({ code: "invalid_response" });
  });
});
