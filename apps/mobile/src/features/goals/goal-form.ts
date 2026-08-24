import { MoneyParseError, parseAmountToMinor, type FinancialGoalStatus } from "@zoption/shared";

export interface GoalFormValues {
  name: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;
  status: FinancialGoalStatus;
}

export type GoalFormErrors = Partial<
  Record<"name" | "targetAmount" | "currentAmount" | "targetDate", string>
>;

export function formatMinorForInput(amountMinor: number): string {
  const magnitude = Math.abs(amountMinor);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function defaultTargetDate(now = new Date()): string {
  const year = now.getUTCFullYear() + 1;
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseGoalForm(
  values: GoalFormValues,
):
  | { success: true; input: { name: string; targetAmountMinor: number; currentAmountMinor: number; targetDate: string; status: FinancialGoalStatus } }
  | { success: false; errors: GoalFormErrors } {
  const errors: GoalFormErrors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = "Enter a goal name.";
  } else if (name.length > 80) {
    errors.name = "Keep the goal name to 80 characters or fewer.";
  }

  let targetAmountMinor: number | null = null;
  try {
    targetAmountMinor = parseAmountToMinor(values.targetAmount);
  } catch (error) {
    errors.targetAmount =
      error instanceof MoneyParseError
        ? error.message
        : "Enter a valid target amount with no more than two decimal places.";
  }
  if (targetAmountMinor !== null && targetAmountMinor < 1) {
    errors.targetAmount = "Enter a target amount of at least ₱0.01.";
  }

  let currentAmountMinor: number | null = null;
  const currentAmountRaw = values.currentAmount.trim();
  try {
    currentAmountMinor = parseAmountToMinor(currentAmountRaw === "" ? "0" : currentAmountRaw);
  } catch (error) {
    errors.currentAmount =
      error instanceof MoneyParseError
        ? error.message
        : "Enter a valid current amount with no more than two decimal places.";
  }
  if (currentAmountMinor !== null && currentAmountMinor < 0) {
    errors.currentAmount = "Enter a current amount of at least ₱0.00.";
  }

  if (!values.targetDate) {
    errors.targetDate = "Choose a target date.";
  } else if (!isValidIsoDate(values.targetDate)) {
    errors.targetDate = "Enter a valid date in YYYY-MM-DD format.";
  }

  if (
    targetAmountMinor !== null &&
    currentAmountMinor !== null &&
    currentAmountMinor > targetAmountMinor
  ) {
    errors.currentAmount = "Current savings cannot exceed the target amount.";
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };
  return {
    success: true,
    input: {
      name,
      targetAmountMinor: targetAmountMinor as number,
      currentAmountMinor: currentAmountMinor as number,
      targetDate: values.targetDate,
      status: values.status,
    },
  };
}

export function goalStatusLabel(status: FinancialGoalStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
  }
}
