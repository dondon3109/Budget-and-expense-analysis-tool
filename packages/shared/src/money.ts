const DECIMAL_AMOUNT = /^\s*([+-])?([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)(?:\.([0-9]{1,2}))?\s*$/;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

export function parseAmountToMinor(value: string): number {
  const match = DECIMAL_AMOUNT.exec(value);
  if (!match) {
    throw new MoneyParseError("Enter a valid amount with no more than two decimal places.");
  }

  const sign = match[1] === "-" ? -1 : 1;
  const whole = Number((match[2] ?? "0").replaceAll(",", ""));
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const minor = whole * 100 + Number(fraction || "0");

  if (!Number.isSafeInteger(minor)) {
    throw new MoneyParseError("The amount is too large.");
  }

  return sign * minor;
}

export function normalizeSignedAmount(amountMinor: number, kind: "income" | "expense"): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyParseError("Money must be represented as integer minor units.");
  }
  const magnitude = Math.abs(amountMinor);
  return kind === "income" ? magnitude : -magnitude;
}
