import { babyPet, noPet } from "./pet-test-fixtures";
import { petMood, petStatusLine } from "./pet-labels";

describe("pet labels", () => {
  it("moves by health, whatever the stage", () => {
    expect(petMood(babyPet)).toBe("cute");
    expect(petMood({ ...babyPet, stage: "legend", nextStagePoints: null })).toBe("cute");
    expect(petMood({ ...babyPet, stage: "legend", healthState: "sick" })).toBe("sick");
    expect(petMood({ ...babyPet, healthState: "fading" })).toBe("fading");
    expect(petMood({ ...noPet, species: "pig" })).toBe("egg");
  });

  it("describes the pet in one line", () => {
    expect(petStatusLine(babyPet)).toBe("120 of 350 points to grow.");
    expect(petStatusLine({ ...babyPet, healthState: "sick" })).toMatch(/sick/);
    expect(petStatusLine({ ...noPet, species: "pig", eggStreakDays: 3 })).toMatch(/Day 3 of 7/);
    expect(petStatusLine({ ...noPet, diedAt: "2026-10-06T01:00:00.000Z" })).toMatch(/passed away/);
  });
});
