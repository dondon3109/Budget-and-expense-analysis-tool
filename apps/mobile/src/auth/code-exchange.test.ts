import { exchangeCodeOnce } from "./code-exchange";

const mockExchange = jest.fn();
jest.mock("./supabase-client", () => ({
  getSupabaseClient: () => ({ auth: { exchangeCodeForSession: mockExchange } }),
}));

describe("exchangeCodeOnce", () => {
  it("exchanges a code once when the browser result and the deep link both deliver it", async () => {
    const data = { session: { access_token: "a" }, user: { id: "u" } };
    mockExchange.mockResolvedValue({ data, error: null });

    const [fromBrowser, fromDeepLink] = await Promise.all([
      exchangeCodeOnce("code-1"),
      exchangeCodeOnce("code-1"),
    ]);

    expect(fromBrowser).toBe(data);
    expect(fromDeepLink).toBe(data);
    expect(mockExchange).toHaveBeenCalledTimes(1);
  });

  it("gives every caller the failure", async () => {
    mockExchange.mockResolvedValue({ data: null, error: new Error("expired") });

    await expect(exchangeCodeOnce("code-2")).rejects.toThrow("expired");
    await expect(exchangeCodeOnce("code-2")).rejects.toThrow("expired");
  });
});
