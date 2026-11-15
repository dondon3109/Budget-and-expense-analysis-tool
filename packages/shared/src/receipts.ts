import type { ReceiptPayment } from "./schemas/receipts";
import { formatMinorAmount } from "./transactions";
import type { ReceiptPaymentType, TransactionKind } from "./types";

/** Keeps each ledger entry meaningful when several items share a receipt. */
export function receiptItemDescription(merchant: string, itemDescription: string): string {
  const merchantName = merchant.trim();
  const itemName = itemDescription.trim();
  if (!merchantName) return itemName;
  if (!itemName || itemName.toLocaleLowerCase("en") === merchantName.toLocaleLowerCase("en")) {
    return merchantName;
  }
  return `${merchantName} · ${itemName}`.slice(0, 240);
}

const PAYMENT_TYPE_LABELS: Record<ReceiptPaymentType, string> = {
  send_money: "Send money",
  receive_money: "Money received",
  bill_payment: "Bills payment",
  merchant_payment: "Payment",
  cash_in: "Cash in",
  cash_out: "Cash out",
  bank_transfer: "Bank transfer",
  remittance: "Remittance",
  mobile_load: "Load",
  other: "Payment",
};

/** The wording both clients and the Worker use for a payment confirmation's type. */
export function receiptPaymentTypeLabel(type: ReceiptPaymentType): string {
  return PAYMENT_TYPE_LABELS[type];
}

/**
 * Money received is income and a cash-in moves money into the wallet; every other confirmation
 * is money the user paid out.
 */
export function receiptPaymentKind(type: ReceiptPaymentType): TransactionKind {
  if (type === "receive_money") return "income";
  if (type === "cash_in") return "transfer";
  return "expense";
}

/** The notes line saved with a scanned payment, so the reference number stays searchable. */
export function receiptPaymentNote(payment: ReceiptPayment): string {
  const parts = [`${payment.provider} ${receiptPaymentTypeLabel(payment.type)}`];
  if (payment.referenceNo) parts.push(`Ref ${payment.referenceNo}`);
  if (payment.sentAmountMinor !== undefined && payment.sentCurrency) {
    parts.push(
      `Sent ${formatMinorAmount(payment.sentAmountMinor)} ${payment.sentCurrency}` +
        (payment.exchangeRate ? ` at ${payment.exchangeRate}` : ""),
    );
  }
  return parts.join(" · ").slice(0, 500);
}
