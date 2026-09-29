jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { getWorkspaceSettings, updateWorkspaceSettings } from "./workspace-settings";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("workspace settings api", () => {
  it("reads the workspace currency", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse({ currency: "USD" })));
    await expect(getWorkspaceSettings({ accessToken: "token", fetchImpl })).resolves.toEqual({
      currency: "USD",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/settings",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("PUTs the new currency and returns the saved value", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse({ currency: "USD" })));
    await expect(
      updateWorkspaceSettings({ accessToken: "token", fetchImpl }, { currency: "USD" }),
    ).resolves.toEqual({ currency: "USD" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ currency: "USD" }) }),
    );
  });

  it("rejects an unknown currency or extra fields from the server", async () => {
    for (const body of [{ currency: "EUR" }, { currency: "PHP", extra: true }, {}]) {
      const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(body)));
      await expect(getWorkspaceSettings({ accessToken: "token", fetchImpl })).rejects.toThrow();
    }
  });
});
