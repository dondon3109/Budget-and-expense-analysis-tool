// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({ auth }),
}));

import { openVoiceStreamWebSocket } from "../src/lib/api";

describe("openVoiceStreamWebSocket", () => {
  it("mints the ticket with a JSON body, which the API requires on every POST", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token", user: { id: "user-1" } } },
      error: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ticket: "t-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("WebSocket", vi.fn());

    await openVoiceStreamWebSocket({ key: "user:user-1", userId: "user-1" });

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe("{}");
  });
});
