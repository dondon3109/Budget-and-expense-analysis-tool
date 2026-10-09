import {
  BUDGET_AND_SUBSCRIPTION_MAX_MINOR,
  calendarEventInputSchema,
  type CalendarEventInput,
  MoneyParseError,
  parseAmountToMinor,
} from "@zoption/shared";

export interface BudgetFormValues {
  categoryId: string;
  amount: string;
}

export type BudgetFormErrors = Partial<Record<"categoryId" | "amount", string>>;

export function formatMinorForInput(amountMinor: number): string {
  const magnitude = Math.abs(amountMinor);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function parseBudgetForm(
  values: BudgetFormValues,
): { success: true; limitMinor: number } | { success: false; errors: BudgetFormErrors } {
  let limitMinor: number;
  try {
    limitMinor = parseAmountToMinor(values.amount);
  } catch (error) {
    return {
      success: false,
      errors: {
        amount:
          error instanceof MoneyParseError
            ? error.message
            : "Enter a valid amount with no more than two decimal places.",
      },
    };
  }
  if (limitMinor < 0) {
    return { success: false, errors: { amount: "Enter a positive budget amount." } };
  }
  if (limitMinor > BUDGET_AND_SUBSCRIPTION_MAX_MINOR) {
    return { success: false, errors: { amount: "That amount is above the supported limit." } };
  }
  if (!values.categoryId.trim()) {
    return { success: false, errors: { categoryId: "Choose an expense category." } };
  }
  return { success: true, limitMinor };
}

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) return month;
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) return month;
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function currentMonthStart(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export interface OccasionFormValues {
  title: string;
  date: string;
}

export type OccasionFormErrors = Partial<Record<"title" | "date", string>>;

/** The name and day of an occasion, which becomes a calendar event the budget hangs on. */
export function parseOccasionForm(
  values: OccasionFormValues,
): { success: true; input: CalendarEventInput } | { success: false; errors: OccasionFormErrors } {
  const parsed = calendarEventInputSchema.safeParse({
    title: values.title,
    date: values.date.trim(),
  });
  if (parsed.success) return { success: true, input: parsed.data };
  const errors: OccasionFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "title" || field === "date") errors[field] ??= issue.message;
  }
  return { success: false, errors };
}

/** "Sat, Aug 15" for an ISO date. */
export function occasionDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
