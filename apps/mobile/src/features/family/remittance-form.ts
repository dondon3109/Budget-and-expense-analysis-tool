import {
  familyRemittanceReceiveSchema,
  familyRemittanceSendSchema,
  parseAmountToMinor,
  type Currency,
  type FamilyRemittanceReceiveInput,
  type FamilyRemittanceSendInput,
} from "@zoption/shared";

import type { LocalCategoryItem } from "@/db/view-models";

export const REMITTANCE_PROVIDERS = [
  "Wise",
  "Remitly",
  "Western Union",
  "GCash",
  "Palawan Express",
  "Bank transfer",
];

export interface ArrivalFormValues {
  amount: string;
  accountId: string;
  categoryId: string;
  date: string;
}

export interface SendFormValues {
  amount: string;
  currency: Currency;
  fee: string;
  provider: string;
  sentOn: string;
  note: string;
}

export type RemittanceFormErrors = Partial<
  Record<"sentAmount" | "fee" | "receivedAmount" | "account" | "category", string>
>;

type Parsed<T> = { success: true; input: T } | { success: false; errors: RemittanceFormErrors };

/** Minor units, or null while the text is not a positive amount. */
function positiveMinor(text: string): number | null {
  try {
    const value = parseAmountToMinor(text);
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** An income category about remittances when one exists, else the first income category. */
export function defaultArrivalCategory(categories: LocalCategoryItem[]): string {
  const income = categories.filter((category) => category.kind === "income" && !category.locked);
  return (
    income.find((category) => /remit|padala|allowance/iu.test(category.name))?.id ??
    income[0]?.id ??
    ""
  );
}

export function parseArrivalForm(values: ArrivalFormValues): Parsed<FamilyRemittanceReceiveInput> {
  const errors: RemittanceFormErrors = {};
  const amountMinor = positiveMinor(values.amount);
  if (amountMinor === null) errors.receivedAmount = "Enter the amount that arrived.";
  if (!values.accountId) errors.account = "Choose the account it landed in.";
  if (!values.categoryId) errors.category = "Choose an income category.";
  if (amountMinor === null || !values.accountId || !values.categoryId) {
    return { success: false, errors };
  }
  return {
    success: true,
    input: familyRemittanceReceiveSchema.parse({
      amountMinor,
      accountId: values.accountId,
      categoryId: values.categoryId,
      date: values.date,
    }),
  };
}

/** A send; `arrival` records it as already arrived in the same step. */
export function parseSendForm(
  values: SendFormValues,
  arrival: ArrivalFormValues | null,
): Parsed<FamilyRemittanceSendInput> {
  const errors: RemittanceFormErrors = {};
  const sentAmountMinor = positiveMinor(values.amount);
  if (sentAmountMinor === null) errors.sentAmount = "Enter the amount you sent.";
  const feeMinor = values.fee.trim() ? positiveMinor(values.fee) : 0;
  if (feeMinor === null) errors.fee = "Enter the fee, or leave it blank.";
  const received = arrival ? parseArrivalForm(arrival) : null;
  if (received && !received.success) Object.assign(errors, received.errors);
  if (sentAmountMinor === null || feeMinor === null || (received && !received.success)) {
    return { success: false, errors };
  }
  return {
    success: true,
    input: familyRemittanceSendSchema.parse({
      sentAmountMinor,
      sentCurrency: values.currency,
      ...(feeMinor ? { feeMinor } : {}),
      ...(values.provider.trim() ? { provider: values.provider.trim() } : {}),
      sentOn: values.sentOn,
      ...(values.note.trim() ? { note: values.note.trim() } : {}),
      ...(received ? { received: received.input } : {}),
    }),
  };
}
