import { describe, expect, it } from "vitest";

import { petEggProgressLine, petHealthHint, petMomentCopy, petStatusLine } from "../src/petCopy";
import { petMoment } from "../src/petMoment";
import type { PetSeen, PetView } from "../src/schemas/pet";

const baby: PetView = {
  enabled: true,
  species: "hippo",
  name: "Bao",
  color: "original",
  stage: "baby",
  points: 120,
  nextStagePoints: 350,
  pointsToday: 10,
  eggStreakDays: 7,
  eggHatchDays: 7,
  health: 100,
  healthState: "healthy",
  lastActivityAt: "2026-10-13T01:00:00.000Z",
  diedAt: null,
};
const seenBaby: PetSeen = {
  species: "hippo",
  stage: "baby",
  unwell: false,
  ready: false,
  diedAt: null,
  date: "2026-10-13",
};

describe("petMoment", () => {
  it("opens once on the first open of each day", () => {
    const first = petMoment(baby, null, "2026-10-13");
    expect(first.moment).toBe("daily");
    expect(petMoment(baby, first.seen, "2026-10-13").moment).toBeNull();
    expect(petMoment(baby, first.seen, "2026-10-14").moment).toBe("daily");
  });

  it("announces a ready egg, a new stage, sickness, and death once each", () => {
    const egg = { ...seenBaby, stage: "egg" as const };
    const readyEgg = { ...baby, stage: "egg" as const, eggStreakDays: 7 };
    expect(petMoment(readyEgg, egg, "2026-10-13").moment).toBe("ready");
    // Tapping it open is the celebration, so the hatch itself raises no pop-up.
    expect(petMoment(baby, { ...egg, ready: true }, "2026-10-13").moment).toBeNull();
    const juvenile = { ...baby, stage: "juvenile" as const };
    expect(petMoment(juvenile, seenBaby, "2026-10-13").moment).toBe("grew");
    const sick = { ...baby, healthState: "sick" as const };
    const announced = petMoment(sick, seenBaby, "2026-10-13");
    expect(announced.moment).toBe("sick");
    expect(petMoment({ ...sick, healthState: "fading" }, announced.seen, "2026-10-13").moment).toBe(
      null,
    );
    const dead = {
      ...baby,
      species: null,
      stage: "egg" as const,
      diedAt: "2026-10-16T01:00:00.000Z",
    };
    const died = petMoment(dead, seenBaby, "2026-10-13");
    expect(died.moment).toBe("died");
    expect(petMoment(dead, died.seen, "2026-10-13").moment).toBeNull();
  });

  it("lets a change replace that day's pop-up", () => {
    const yesterday = { ...seenBaby, stage: "egg" as const, date: "2026-10-12" };
    const readyEgg = { ...baby, stage: "egg" as const, eggStreakDays: 7 };
    const result = petMoment(readyEgg, yesterday, "2026-10-13");
    expect(result.moment).toBe("ready");
    expect(petMoment(readyEgg, result.seen, "2026-10-13").moment).toBeNull();
  });

  it("stays quiet when healing, picking a new egg, or with no pet to show", () => {
    expect(petMoment(baby, { ...seenBaby, unwell: true }, "2026-10-13").moment).toBeNull();
    const newEgg = { ...baby, species: "pig" as const, stage: "egg" as const, eggStreakDays: 0 };
    expect(petMoment(newEgg, seenBaby, "2026-10-13").moment).toBeNull();
    expect(petMoment({ ...baby, enabled: false }, null, "2026-10-13")).toEqual({
      moment: null,
      seen: null,
    });
    const unchosen = { ...baby, species: null, stage: "egg" as const };
    expect(petMoment(unchosen, null, "2026-10-13").moment).toBeNull();
  });
});

describe("petMomentCopy", () => {
  it("names the pet, alive or remembered", () => {
    expect(petMomentCopy("grew", { ...baby, stage: "adult" }).title).toBe("Bao is now an Adult!");
    const dead = {
      ...baby,
      species: null,
      stage: "egg" as const,
      diedAt: "2026-10-16T01:00:00.000Z",
    };
    expect(petMomentCopy("died", dead).title).toBe("Bao passed away");
    expect(petMomentCopy("died", { ...dead, name: null }).title).toBe("Your pet passed away");
    expect(petMomentCopy("daily", { ...baby, healthState: "sick" })).toEqual({
      title: "Bao · Baby",
      body: "Feeling sick. Log something to heal it.",
    });
  });

  it("describes the pet in one line", () => {
    expect(petStatusLine(baby)).toBe("120 of 350 points to grow.");
    const egg = { ...baby, stage: "egg" as const, eggStreakDays: 3 };
    expect(petStatusLine(egg)).toMatch(/Day 3 of 7/);
    expect(petEggProgressLine(egg)).toBe(
      "3-day streak active. Open Zoption for 4 more days to hatch it. Missing a day starts over.",
    );
    expect(
      petMomentCopy("daily", {
        ...baby,
        species: null,
        stage: "egg",
        diedAt: "2026-10-16T01:00:00.000Z",
      }),
    ).toEqual({
      title: "Ready for a new egg",
      body: "Bao passed away. Pick a new egg whenever you're ready.",
    });
  });

  it("explains health countdowns and exact heal cost", () => {
    const at = Date.parse(baby.lastActivityAt!);
    expect(petHealthHint(baby, at + 6 * 60 * 60 * 1000)).toBe(
      "Full for 24h after activity · drops in ~18h.",
    );
    expect(
      petHealthHint({ ...baby, health: 75, healthState: "sick" }, at + 36 * 60 * 60 * 1000),
    ).toBe(
      "Costs 25 pts to heal on your next activity (never drops below your stage). Fading starts in ~12h.",
    );
    expect(
      petHealthHint(
        { ...baby, points: 0, health: 25, healthState: "fading" },
        at + 60 * 60 * 60 * 1000,
      ),
    ).toBe("Heals free on your next activity. Log something within ~12h or it passes away.");
  });
});
