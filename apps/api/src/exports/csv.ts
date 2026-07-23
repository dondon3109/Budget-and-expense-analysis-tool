import type { TransactionListItem } from "@zoption/shared";

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function safeText(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function buildTransactionCsv(rows: readonly TransactionListItem[]): string {
  const output = [
    ["Date", "Description", "Amount", "Currency", "Type", "Category", "Account", "Notes"],
    ...rows.map((row) => [
      row.date,
      safeText(row.description),
      formatMinor(row.amountMinor),
      row.currency,
      row.kind,
      safeText(row.categoryName),
      safeText(row.accountName),
      safeText(row.notes ?? ""),
    ]),
  ];
  return `${output.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
