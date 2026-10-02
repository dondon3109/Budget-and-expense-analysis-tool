jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { getGoalProfile, markGoalShown, saveGoal, skipGoal } from "./goal-profile";

const profile = { goal: "build_budget", otherText: null, selectedAt: "2026-10-02", skipped: false };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("goal profile api", () => {
  it("reads and validates the profile", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(profile)));
    await expect(getGoalProfile({ accessToken: "token", fetchImpl })).resolves.toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/profile/goal",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("PUTs the goal, POSTs skip and shown", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(profile)));
    await saveGoal({ accessToken: "token", fetchImpl }, { goal: "other", otherText: "pets" });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.zoption.test/api/app/profile/goal",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ goal: "other", otherText: "pets" }),
      }),
    );
    await skipGoal({ accessToken: "token", fetchImpl });
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.zoption.test/api/app/profile/goal/skip",
      expect.objectContaining({ method: "POST" }),
    );
    const noContent = jest.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    await expect(markGoalShown({ accessToken: "token", fetchImpl: noContent })).resolves.toBe(
      undefined,
    );
    expect(noContent).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/profile/goal/shown",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects an unknown goal or extra fields from the server", async () => {
    for (const body of [
      { ...profile, goal: "win" },
      { ...profile, extra: true },
    ]) {
      const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(body)));
      await expect(getGoalProfile({ accessToken: "token", fetchImpl })).rejects.toThrow();
    }
  });
});
