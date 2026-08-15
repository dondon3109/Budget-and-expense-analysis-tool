import { debtTypeLabels, formatMinorForInput, parseDebtForm, type DebtFormValues } from "./debt-form";

function validValues(): DebtFormValues {
  return {
    name: "Car Loan",
    type: "auto_loan",
    balance: "5000.00",
    apr: "8.5",
    minimumPayment: "120.00",
    balanceAsOf: "2026-08-14",
  };
}

describe("debt form", () => {
  it("parses a valid debt into minor-unit input", () => {
    const result = parseDebtForm(validValues());
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input).toEqual({
      name: "Car Loan",
      type: "auto_loan",
      balanceMinor: 500_000,
      aprBasisPoints: 850,
      minimumPaymentMinor: 12_000,
      balanceAsOf: "2026-08-14",
    });
  });

  it("trims the debt name", () => {
    const result = parseDebtForm({ ...validValues(), name: "  Car Loan  " });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.name).toBe("Car Loan");
  });

  it("rejects an empty name", () => {
    const result = parseDebtForm({ ...validValues(), name: "   " });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.name).toBe("string");
  });

  it("rejects a zero balance", () => {
    const result = parseDebtForm({ ...validValues(), balance: "0.00" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.balance).toBe("string");
  });

  it("rejects an APR above 100 percent", () => {
    const result = parseDebtForm({ ...validValues(), apr: "120" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.apr).toBe("string");
  });

  it("allows an empty minimum payment", () => {
    const result = parseDebtForm({ ...validValues(), minimumPayment: "" });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.minimumPaymentMinor).toBe(0);
  });

  it("rejects an invalid balance-as-of date", () => {
    const result = parseDebtForm({ ...validValues(), balanceAsOf: "2026-02-30" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.balanceAsOf).toBe("string");
  });

  it("formats minor units for input", () => {
    expect(formatMinorForInput(500_000)).toBe("5000.00");
    expect(formatMinorForInput(0)).toBe("0.00");
    expect(formatMinorForInput(12_345)).toBe("123.45");
  });

  it("labels every debt type", () => {
    expect(Object.keys(debtTypeLabels)).toHaveLength(5);
    expect(debtTypeLabels.credit_card).toBe("Credit card");
  });
});
