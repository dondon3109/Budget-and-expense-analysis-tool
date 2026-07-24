import { describe, expect, it } from "vitest";

import { evaluatePassword, PASSWORD_POLICY } from "../src/auth/passwordPolicy";

describe("password policy", () => {
  it("requires every configured character rule", () => {
    const evaluation = evaluatePassword("short");

    expect(evaluation.isValid).toBe(false);
    expect(evaluation.score).toBe(1);
    expect(evaluation.requirements).toEqual([
      { id: "length", label: `At least ${PASSWORD_POLICY.minLength} characters`, met: false },
      { id: "lowercase", label: "A lowercase letter", met: true },
      { id: "uppercase", label: "An uppercase letter", met: false },
      { id: "number", label: "A number", met: false },
      { id: "special", label: "A special character", met: false },
    ]);
  });

  it.each([
    ["", "empty"],
    ["short", "weak"],
    ["lowercaseonly", "weak"],
    ["lowercase-Uppercase", "medium"],
    ["lowercase-Uppercase-1", "strong"],
  ] as const)("labels %s as %s", (password, strength) => {
    expect(evaluatePassword(password).strength).toBe(strength);
  });

  it("accepts a password that meets all five requirements", () => {
    const evaluation = evaluatePassword("Budgeting-2026!");

    expect(evaluation.isValid).toBe(true);
    expect(evaluation.score).toBe(evaluation.maxScore);
    expect(evaluation.strength).toBe("strong");
  });
});
