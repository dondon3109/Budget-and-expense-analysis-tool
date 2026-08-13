import {
  MoneyParseError,
  parseAmountToMinor,
  transactionInputSchema,
  type TransactionInput,
} from "@zoption/shared";

export type TransactionFormKind = "income" | "expense" | "transfer";

export interface TransactionFormValues {
  kind: TransactionFormKind;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  date: string;
  description: string;
  amount: string;
  transferFee: string;
  currency: "PHP" | "USD";
  notes: string;
}

export type TransactionFormErrors = Partial<
  Record<
    | "accountId"
    | "toAccountId"
    | "categoryId"
    | "date"
    | "description"
    | "amount"
    | "transferFee"
    | "notes",
    string
  >
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
): { success: true; input: TransactionInput } | { success: false; errors: TransactionFormErrors } {
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
  let transferFeeMinor: number | undefined;
  if (values.kind === "transfer" && values.transferFee.trim()) {
    try {
      transferFeeMinor = parseAmountToMinor(values.transferFee);
    } catch (error) {
      return {
        success: false,
        errors: {
          transferFee:
            error instanceof MoneyParseError
              ? error.message
              : "Enter a valid fee with no more than two decimal places.",
        },
      };
    }
  }
  const parsed = transactionInputSchema.safeParse({
    kind: values.kind,
    ...(values.kind === "transfer"
      ? {
          fromAccountId: values.accountId,
          toAccountId: values.toAccountId,
          transferFeeMinor,
        }
      : { accountId: values.accountId }),
    categoryId: values.categoryId,
    date: values.date,
    description: values.description,
    amountMinor,
    currency: values.currency,
    notes: values.notes || undefined,
  });
  if (parsed.success) {
    return { success: true, input: parsed.data };
  }

  const errors: TransactionFormErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const formField =
        field === "amountMinor"
          ? "amount"
          : field === "fromAccountId"
            ? "accountId"
            : field === "transferFeeMinor"
              ? "transferFee"
              : field;
      if (
        typeof formField === "string" &&
        [
          "accountId",
          "toAccountId",
          "categoryId",
          "date",
          "description",
          "amount",
          "transferFee",
          "notes",
        ].includes(formField)
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
