import { assertDevelopmentAppVariant, isDevelopmentAppVariant } from "./app-variant";

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
