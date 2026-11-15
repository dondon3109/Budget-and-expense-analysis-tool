import {
  assertDevelopmentAppVariant,
  isDevelopmentAppVariant,
  isPlayDistribution,
} from "./app-variant";

describe("app variant capabilities", () => {
  it("enables demo capabilities only for the explicit development variant", () => {
    expect(isDevelopmentAppVariant({ appVariant: "development" })).toBe(true);
    expect(isDevelopmentAppVariant({ appVariant: "preview" })).toBe(false);
    expect(isDevelopmentAppVariant({ appVariant: "production" })).toBe(false);
  });

  it("fails closed when variant metadata is missing or malformed", () => {
    expect(isDevelopmentAppVariant()).toBe(false);
    expect(isDevelopmentAppVariant({})).toBe(false);
    expect(isDevelopmentAppVariant({ appVariant: true })).toBe(false);
  });

  it("blocks demo-only operations outside development", () => {
    expect(() => assertDevelopmentAppVariant({ appVariant: "development" })).not.toThrow();
    expect(() => assertDevelopmentAppVariant({ appVariant: "production" })).toThrow(
      "Demo data is available only in Zoption Dev.",
    );
  });
});

describe("app distribution", () => {
  it("is Play only when the embedded distribution says so", () => {
    expect(isPlayDistribution({ appVariant: "production", distribution: "play" })).toBe(true);
    expect(isPlayDistribution({ appVariant: "production", distribution: "apk" })).toBe(false);
    expect(isPlayDistribution({ appVariant: "production" })).toBe(false);
    expect(isPlayDistribution(null)).toBe(false);
  });
});
