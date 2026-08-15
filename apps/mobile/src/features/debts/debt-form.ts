import { debtInputSchema, type DebtType } from "@zoption/shared";

export interface DebtFormValues {
  name: string;
  type: DebtType;
  balance: string;
  apr: string;
  minimumPayment: string;
  balanceAsOf: string;
}

export interface DebtFormErrors {
  name?: string;
  balance?: string;
  apr?: string;
  minimumPayment?: string;
  balanceAsOf?: string;
}

const amountPattern = /^\d{1,13}(\.\d{1,2})?$/;
const aprPattern = /^\d{1,4}(\.\d{1,4})?$/;
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

function parseAprBasisPoints(value: string): number | null {
  if (!aprPattern.test(value)) return null;
  return Math.round(Number(value) * 100);
}

export function parseDebtForm(values: DebtFormValues):
  | { success: true; input: { name: string; type: DebtType; balanceMinor: number; aprBasisPoints: number; minimumPaymentMinor: number; balanceAsOf: string } }
  | { success: false; errors: DebtFormErrors } {
  const errors: DebtFormErrors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = "Give this debt a name.";
  } else if (name.length > 80) {
    errors.name = "Keep the name under 80 characters.";
  }

  const balanceMinor = amountPattern.test(values.balance) ? parseMinor(values.balance) : null;
  if (balanceMinor === null || balanceMinor <= 0) {
    errors.balance = "Enter the remaining balance as a positive amount.";
  }

  const aprBasisPoints = parseAprBasisPoints(values.apr);
  if (aprBasisPoints === null || aprBasisPoints < 0 || aprBasisPoints > 10_000) {
    errors.apr = "Enter an annual rate between 0 and 100 percent.";
  }

  const minimumPaymentMinor =
    values.minimumPayment.trim() === ""
      ? 0
      : amountPattern.test(values.minimumPayment)
        ? parseMinor(values.minimumPayment)
        : null;
  if (minimumPaymentMinor === null) {
    errors.minimumPayment = "Enter the minimum monthly payment.";
  }

  if (!isValidIsoDate(values.balanceAsOf)) {
    errors.balanceAsOf = "Use a valid YYYY-MM-DD date.";
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };

  const input = {
    name,
    type: values.type,
    balanceMinor: balanceMinor ?? 0,
    aprBasisPoints: aprBasisPoints ?? 0,
    minimumPaymentMinor: minimumPaymentMinor ?? 0,
    balanceAsOf: values.balanceAsOf,
  };
  debtInputSchema.parse(input);
  return { success: true, input };
}

export const debtTypeLabels: Record<DebtType, string> = {
  credit_card: "Credit card",
  personal_loan: "Personal loan",
  auto_loan: "Auto loan",
  mortgage: "Mortgage",
  other: "Other",
};
