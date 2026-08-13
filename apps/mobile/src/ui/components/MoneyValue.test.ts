import { formatMoneyMinor, moneyAccessibilityLabel } from "./MoneyValue";

describe("MoneyValue formatting", () => {
  it("formats Philippine peso minor units without floating-point input", () => {
    expect(formatMoneyMinor(123_456, "PHP")).toContain("1,234.56");
    expect(formatMoneyMinor(-50, "PHP")).toContain("0.50");
  });

  it("provides a screen-reader label with currency and sign", () => {
    expect(moneyAccessibilityLabel(-12_345, "PHP")).toBe("negative 123.45 Philippine pesos");
  });
});
