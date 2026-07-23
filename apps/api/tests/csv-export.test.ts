import type { TransactionListItem } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { buildTransactionCsv } from "../src/exports/csv";

const transaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-20",
  description: '=SUM(1,2) "market"',
  amountMinor: -125_050,
  currency: "PHP",
  kind: "expense",
  categoryId: "food",
  categoryName: "Food, dining",
  categoryColor: "#dc8b3f",
  accountId: "account-everyday",
  accountName: "Everyday account",
  notes: "line one\nline two",
};

describe("transaction CSV export", () => {
  it("preserves exact money, quotes fields, and neutralizes spreadsheet formulas", () => {
    const csv = buildTransactionCsv([transaction]);
    expect(csv).toContain("-1250.50,PHP,expense");
    expect(csv).toContain('"\'=SUM(1,2) ""market"""');
    expect(csv).toContain('"Food, dining"');
    expect(csv).toContain('"line one\nline two"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
