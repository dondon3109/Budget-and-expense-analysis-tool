import { WORKSPACE_HEADER } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    data: { session: { access_token: "token", user: { id: "user-1" } } },
    error: null,
  })),
}));

vi.mock("../src/lib/supabase", () => ({ getSupabaseClient: () => ({ auth }) }));

import { getBudgets } from "../src/lib/api";
import { familyWorkspace, personalWorkspace } from "../src/lib/workspace";

const user = { id: "user-1" } as Parameters<typeof familyWorkspace>[0];

afterEach(() => vi.restoreAllMocks());

describe("workspace header", () => {
  it("names the family only for requests made in it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const family = familyWorkspace(user, "family:abc");

    await getBudgets(family, { scope: "every-month" });
    await getBudgets(personalWorkspace(family), { scope: "every-month" });

    const headers = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers[0]!.get(WORKSPACE_HEADER)).toBe("family:abc");
    expect(headers[1]!.has(WORKSPACE_HEADER)).toBe(false);
    // Each workspace keeps its own cache: the family key differs from the personal one.
    expect(family.key).not.toBe(personalWorkspace(family).key);
  });
});
