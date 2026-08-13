import {
  MoneyParseError,
  parseAmountToMinor,
  transactionInputSchema,
  type TransactionInput,
} from "@zoption/shared";

export type TransactionFormKind = "income" | "expense";

export interface TransactionFormValues {
  kind: TransactionFormKind;
  accountId: string;
  categoryId: string;
  date: string;
  description: string;
  amount: string;
  currency: "PHP" | "USD";
  notes: string;
}

export type TransactionFormErrors = Partial<
  Record<"accountId" | "categoryId" | "date" | "description" | "amount" | "notes", string>
>;

export function formatMinorForInput(amountMinor: number): string {
  const magnitude = Math.abs(amountMinor);
  const whole = Math.floor(magnitude / 100);
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function localCalendarDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseTransactionForm(
  values: TransactionFormValues,
):
  | { success: true; input: Extract<TransactionInput, { kind: TransactionFormKind }> }
  | { success: false; errors: TransactionFormErrors } {
  let amountMinor: number;
  try {
    amountMinor = parseAmountToMinor(values.amount);
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
  const parsed = transactionInputSchema.safeParse({
    kind: values.kind,
    accountId: values.accountId,
    categoryId: values.categoryId,
    date: values.date,
    description: values.description,
    amountMinor,
    currency: values.currency,
    notes: values.notes || undefined,
  });
  if (parsed.success && parsed.data.kind !== "transfer") {
    return { success: true, input: parsed.data };
  }

  const errors: TransactionFormErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const formField = field === "amountMinor" ? "amount" : field;
      if (
        typeof formField === "string" &&
        ["accountId", "categoryId", "date", "description", "amount", "notes"].includes(formField)
      ) {
        errors[formField as keyof TransactionFormErrors] ??= issue.message;
      }
    }
  }
  return {
    success: false,
    errors: Object.keys(errors).length > 0 ? errors : { description: "Check these details." },
  };
}
