import type { PetView } from "@zoption/shared";

/** A healthy hatched Baby; tests override what they need. */
export const babyPet: PetView = {
  enabled: true,
  species: "panda",
  stage: "baby",
  points: 120,
  nextStagePoints: 350,
  pointsToday: 30,
  eggStreakDays: 7,
  eggHatchDays: 7,
  health: 100,
  healthState: "healthy",
  lastActivityAt: "2026-10-03T01:00:00.000Z",
  diedAt: null,
};

export const noPet: PetView = {
  ...babyPet,
  species: null,
  stage: "egg",
  points: 0,
  nextStagePoints: null,
  pointsToday: 0,
  eggStreakDays: 0,
  health: null,
  healthState: null,
  lastActivityAt: null,
};
