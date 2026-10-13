import { describe, expect, it } from "vitest";

import { petMomentCopy, petStatusLine } from "../src/petCopy";
import { petMoment } from "../src/petMoment";
import type { PetSeen, PetView } from "../src/schemas/pet";

const baby: PetView = {
  enabled: true,
  species: "panda",
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
  species: "panda",
  stage: "baby",
  unwell: false,
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

  it("announces a hatch, a new stage, sickness, and death once each", () => {
    const egg = { ...seenBaby, stage: "egg" as const };
    expect(petMoment(baby, egg, "2026-10-13").moment).toBe("hatched");
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
    const result = petMoment(baby, yesterday, "2026-10-13");
    expect(result.moment).toBe("hatched");
    expect(petMoment(baby, result.seen, "2026-10-13").moment).toBeNull();
  });

  it("stays quiet when healing, picking a new egg, or with no pet to show", () => {
    expect(petMoment(baby, { ...seenBaby, unwell: true }, "2026-10-13").moment).toBeNull();
    const newEgg = { ...baby, species: "pig" as const, stage: "egg" as const };
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
  it("names the pet, and a dead pet from what the device showed last", () => {
    expect(petMomentCopy("grew", { ...baby, stage: "adult" }, seenBaby).title).toBe(
      "Your panda is now an Adult!",
    );
    const dead = {
      ...baby,
      species: null,
      stage: "egg" as const,
      diedAt: "2026-10-16T01:00:00.000Z",
    };
    expect(petMomentCopy("died", dead, seenBaby).title).toBe("Your panda passed away");
    expect(petMomentCopy("daily", { ...baby, healthState: "sick" }, seenBaby)).toEqual({
      title: "Panda · Baby",
      body: "Feeling sick. Log something to heal it.",
    });
  });

  it("describes the pet in one line", () => {
    expect(petStatusLine(baby)).toBe("120 of 350 points to grow.");
    const egg = { ...baby, stage: "egg" as const, eggStreakDays: 3 };
    expect(petStatusLine(egg)).toMatch(/Day 3 of 7/);
  });
});
