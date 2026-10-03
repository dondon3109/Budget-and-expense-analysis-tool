jest.mock("@/config/public-config", () => ({
  publicConfig: { apiUrl: "https://api.zoption.test" },
}));

import { checkInPet, choosePetEgg, getPet, setPetEnabled } from "./pet";

const view = {
  enabled: true,
  species: "panda",
  stage: "egg",
  points: 0,
  nextStagePoints: null,
  pointsToday: 0,
  eggStreakDays: 2,
  eggHatchDays: 7,
  health: null,
  healthState: null,
  lastActivityAt: null,
  diedAt: null,
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pet api", () => {
  it("calls each pet route and validates the view", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse(view)));
    const api = { accessToken: "token", fetchImpl };

    await expect(getPet(api)).resolves.toEqual(view);
    await checkInPet(api);
    await choosePetEgg(api, "panda");
    await setPetEnabled(api, false);

    const base = "https://api.zoption.test/api/app/pet";
    expect(fetchImpl).toHaveBeenNthCalledWith(1, base, expect.objectContaining({ method: "GET" }));
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `${base}/check-in`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      `${base}/egg`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ species: "panda" }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      `${base}/settings`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: false }) }),
    );
  });

  it("rejects a view it does not understand", async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse({ ...view, stage: "dragon" })));
    await expect(getPet({ accessToken: "token", fetchImpl })).rejects.toThrow();
  });
});
