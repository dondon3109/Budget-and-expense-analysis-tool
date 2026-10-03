import { formatMoneyMinor, moneyAccessibilityLabel } from "./MoneyValue";

describe("MoneyValue formatting", () => {
  it("formats Philippine peso minor units without floating-point input", () => {
    expect(formatMoneyMinor(123_456, "PHP")).toContain("1,234.56");
    expect(formatMoneyMinor(-50, "PHP")).toContain("0.50");
  });

  it("provides a screen-reader label with currency and sign", () => {
    expect(moneyAccessibilityLabel(-12_345, "PHP")).toBe("negative 123.45 Philippine pesos");
    expect(moneyAccessibilityLabel(5_000, "EUR")).toBe("50,00 euros");
  });

  it("prints a whole zero-decimal amount without decimals but keeps a fractional one", () => {
    expect(formatMoneyMinor(150_000, "JPY")).toContain("1,500");
    expect(formatMoneyMinor(150_000, "JPY")).not.toContain(".00");
    expect(formatMoneyMinor(150_050, "JPY")).toContain("1,500.50");
    expect(moneyAccessibilityLabel(150_000, "JPY")).toBe("1,500 Japanese yen");
  });
});
