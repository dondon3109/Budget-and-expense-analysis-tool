import { babyPet, noPet } from "./pet-test-fixtures";
import { petMood, petStatusLine } from "./pet-labels";

describe("pet labels", () => {
  it("makes only a healthy Monster aggressive", () => {
    expect(petMood(babyPet)).toBe("cute");
    expect(petMood({ ...babyPet, stage: "adult" })).toBe("cute");
    expect(petMood({ ...babyPet, stage: "monster", nextStagePoints: null })).toBe("aggressive");
    expect(petMood({ ...babyPet, stage: "monster", healthState: "sick" })).toBe("sick");
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
