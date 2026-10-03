jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { getGoalsProfile, markGoalShown, saveGoals, skipGoal } from "./goal-profile";

const profile = {
  goals: ["build_budget", "reduce_debt"],
  otherText: null,
  selectedAt: "2026-10-02",
  skipped: false,
};
const single = { goal: null, otherText: null, selectedAt: null, skipped: true };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("goal profile api", () => {
  it("reads and validates the profile", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(profile)));
    await expect(getGoalsProfile({ accessToken: "token", fetchImpl })).resolves.toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.zoption.test/api/app/profile/goals",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("PUTs the goals in order, POSTs skip and shown on the single-goal routes", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(profile)));
    await saveGoals(
      { accessToken: "token", fetchImpl },
      { goals: ["other", "build_budget"], otherText: "pets" },
    );
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.zoption.test/api/app/profile/goals",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ goals: ["other", "build_budget"], otherText: "pets" }),
      }),
    );
    const skipFetch = jest.fn(() => Promise.resolve(jsonResponse(single)));
    await expect(skipGoal({ accessToken: "token", fetchImpl: skipFetch })).resolves.toEqual(single);
    expect(skipFetch).toHaveBeenLastCalledWith(
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
      { ...profile, goals: ["win"] },
      { ...profile, extra: true },
    ]) {
      const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(body)));
      await expect(getGoalsProfile({ accessToken: "token", fetchImpl })).rejects.toThrow();
    }
  });
});
