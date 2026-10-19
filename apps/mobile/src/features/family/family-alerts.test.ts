import { readThreshold } from "./FamilyAlertsCard";

jest.mock("@/api/family", () => ({}));

describe("readThreshold", () => {
  it("reads blank as off, a positive amount as minor units, and anything else as invalid", () => {
    expect(readThreshold("  ")).toBeNull();
    expect(readThreshold("1,500.50")).toBe(150_050);
    expect(readThreshold("0")).toBeUndefined();
    expect(readThreshold("abc")).toBeUndefined();
  });
});
