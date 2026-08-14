import {
  defaultTargetDate,
  formatMinorForInput,
  parseGoalForm,
  type GoalFormValues,
} from "./goal-form";

function validValues(): GoalFormValues {
  return {
    name: "Emergency Fund",
    targetAmount: "10000.00",
    currentAmount: "2500.00",
    targetDate: "2027-12-31",
    status: "active",
  };
}

describe("goal form", () => {
  it("parses a valid goal into minor-unit input", () => {
    const result = parseGoalForm(validValues());
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input).toEqual({
      name: "Emergency Fund",
      targetAmountMinor: 1_000_000,
      currentAmountMinor: 250_000,
      targetDate: "2027-12-31",
      status: "active",
    });
  });

  it("trims the goal name", () => {
    const result = parseGoalForm({ ...validValues(), name: "  House Fund  " });
    if (!result.success) throw new Error(JSON.stringify(result.errors));
    expect(result.input.name).toBe("House Fund");
  });

  it("rejects an empty name", () => {
    const result = parseGoalForm({ ...validValues(), name: "   " });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.name).toBe("string");
  });

  it("rejects a target amount below one cent", () => {
    const result = parseGoalForm({ ...validValues(), targetAmount: "0.00" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.targetAmount).toBe("string");
  });

  it("rejects current savings above the target", () => {
    const result = parseGoalForm({ ...validValues(), currentAmount: "12000.00" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.currentAmount).toBe("string");
  });

  it("rejects an invalid target date", () => {
    const result = parseGoalForm({ ...validValues(), targetDate: "2027-02-30" });
    if (result.success) throw new Error("expected failure");
    expect(typeof result.errors.targetDate).toBe("string");
  });

  it("formats minor units for input", () => {
    expect(formatMinorForInput(1_000_000)).toBe("10000.00");
    expect(formatMinorForInput(0)).toBe("0.00");
  });

  it("defaults the target date to one year from now", () => {
    expect(defaultTargetDate(new Date("2026-08-14T00:00:00Z"))).toBe("2027-08-14");
  });
});
