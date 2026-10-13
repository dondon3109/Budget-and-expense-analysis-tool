import { babyPet, noPet } from "./pet-test-fixtures";
import { petMood } from "./pet-labels";

describe("petMood", () => {
  it("moves by health, whatever the stage", () => {
    expect(petMood(babyPet)).toBe("cute");
    expect(petMood({ ...babyPet, stage: "legend", nextStagePoints: null })).toBe("cute");
    expect(petMood({ ...babyPet, stage: "legend", healthState: "sick" })).toBe("sick");
    expect(petMood({ ...babyPet, healthState: "fading" })).toBe("fading");
    expect(petMood({ ...noPet, species: "pig" })).toBe("egg");
  });
});
