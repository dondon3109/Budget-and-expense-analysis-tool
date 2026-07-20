import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth }),
}));

import { getDashboard } from "../src/lib/api";
import { demoWorkspace, type AuthenticatedWorkspace } from "../src/lib/workspace";

const userWorkspace: AuthenticatedWorkspace = {
  mode: "user",
  key: "user:user-1",
  userId: "user-1",
};
const dashboard = {
  period: { from: "2026-07-01", to: "2026-07-31" },
  metrics: {
    moneyInMinor: 0,
    moneyOutMinor: 0,
    netMinor: 0,
    remainingBudgetMinor: 0,
    budgetUsedPercent: 0,
  },
  spendingByCategory: [],
  monthlyTrend: [],
  insights: [],
  budgetProgress: [],
};

function session(token: string) {
  return { access_token: token, user: { id: "user-1" } };
}

describe("authenticated API requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.getSession.mockReset();
    auth.refreshSession.mockReset();
    auth.signOut.mockReset();
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("keeps the public demo request unauthenticated", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(dashboard), { status: 200 }));

    await getDashboard(demoWorkspace);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/demo/dashboard?from=2026-07-01&to=2026-07-31",
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("attaches the session token and retries once with a refreshed token after 401", async () => {
    auth.getSession.mockResolvedValue({ data: { session: session("old-token") }, error: null });
    auth.refreshSession.mockResolvedValue({ data: { session: session("new-token") }, error: null });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_access_token" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(dashboard), { status: 200 }));

    await getDashboard(userWorkspace);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/app/dashboard?from=2026-07-01&to=2026-07-31",
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer old-token",
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer new-token",
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out after the refreshed request is also unauthorized", async () => {
    auth.getSession.mockResolvedValue({ data: { session: session("old-token") }, error: null });
    auth.refreshSession.mockResolvedValue({ data: { session: session("new-token") }, error: null });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_access_token" }), { status: 401 }),
    );

    await expect(getDashboard(userWorkspace)).rejects.toMatchObject({ status: 401 });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
