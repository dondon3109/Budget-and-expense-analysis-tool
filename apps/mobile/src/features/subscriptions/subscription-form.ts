import {
  subscriptionInputSchema,
  type SubscriptionBillingCycle,
} from "@zoption/shared";

export interface SubscriptionFormValues {
  name: string;
  amount: string;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  categoryId: string;
  accountId: string;
}

export interface SubscriptionFormErrors {
  name?: string;
  amount?: string;
  nextBillingDate?: string;
  categoryId?: string;
  accountId?: string;
}

const amountPattern = /^\d{1,13}(\.\d{1,2})?$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function formatMinorForInput(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = Math.abs(value % 100);
  return whole + "." + String(fraction).padStart(2, "0");
}

export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

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

function parseMinor(value: string): number | null {
  const [wholeText, fractionText = ""] = value.split(".");
  const whole = Number(wholeText);
  const fraction = Number(fractionText.padEnd(2, "0").slice(0, 2) || 0);
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return null;
  return Math.round(whole * 100) + fraction;
}

export function parseSubscriptionForm(
  values: SubscriptionFormValues,
):
  | {
      success: true;
      input: {
        name: string;
        amountMinor: number;
        billingCycle: SubscriptionBillingCycle;
        nextBillingDate: string;
        categoryId: string;
        accountId: string;
      };
    }
  | { success: false; errors: SubscriptionFormErrors } {
  const errors: SubscriptionFormErrors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = "Give this subscription a name.";
  } else if (name.length > 120) {
    errors.name = "Keep the name under 120 characters.";
  }

  const amountMinor = amountPattern.test(values.amount) ? parseMinor(values.amount) : null;
  if (amountMinor === null || amountMinor <= 0) {
    errors.amount = "Enter the charge amount as a positive value.";
  }

  if (!isValidIsoDate(values.nextBillingDate)) {
    errors.nextBillingDate = "Use a valid YYYY-MM-DD date.";
  }

  if (!values.categoryId) {
    errors.categoryId = "Choose an expense category for this subscription.";
  }

  if (!values.accountId) {
    errors.accountId = "Choose the account this subscription is charged to.";
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };

  const input = {
    name,
    amountMinor: amountMinor ?? 0,
    billingCycle: values.billingCycle,
    nextBillingDate: values.nextBillingDate,
    categoryId: values.categoryId,
    accountId: values.accountId,
  };
  subscriptionInputSchema.parse(input);
  return { success: true, input };
}

export const billingCycleLabels: Record<SubscriptionBillingCycle, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
};
