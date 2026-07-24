export const PASSWORD_POLICY = {
  minLength: 12,
  summary: "12+ characters with uppercase, lowercase, a number, and a special character.",
} as const;

export type PasswordRequirementId = "length" | "lowercase" | "uppercase" | "number" | "special";
export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

export interface PasswordRequirement {
  id: PasswordRequirementId;
  label: string;
  met: boolean;
}

export interface PasswordEvaluation {
  score: number;
  maxScore: number;
  strength: PasswordStrength;
  isValid: boolean;
  requirements: PasswordRequirement[];
}

const REQUIREMENT_LABELS: Record<PasswordRequirementId, string> = {
  length: `At least ${PASSWORD_POLICY.minLength} characters`,
  lowercase: "A lowercase letter",
  uppercase: "An uppercase letter",
  number: "A number",
  special: "A special character",
};

export function evaluatePassword(password: string): PasswordEvaluation {
  const checks: Record<PasswordRequirementId, boolean> = {
    length: password.length >= PASSWORD_POLICY.minLength,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
  const requirements = (Object.keys(REQUIREMENT_LABELS) as PasswordRequirementId[]).map((id) => ({
    id,
    label: REQUIREMENT_LABELS[id],
    met: checks[id],
  }));
  const score = requirements.filter((requirement) => requirement.met).length;
  const isValid = score === requirements.length;
  const strength: PasswordStrength = !password
    ? "empty"
    : isValid
      ? "strong"
      : score >= 3
        ? "medium"
        : "weak";

  return {
    score,
    maxScore: requirements.length,
    strength,
    isValid,
    requirements,
  };
}
