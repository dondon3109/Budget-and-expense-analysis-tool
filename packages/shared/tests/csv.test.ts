import { describe, expect, it } from "vitest";

import { CsvParseError, inspectCsv, parseCsv } from "../src/csv";

describe("CSV parsing", () => {
  it("parses quoted commas, quotes, and line endings", () => {
    const parsed = parseCsv(
      '﻿Date,Description,Amount\r\n2026-07-01,"Groceries, weekly","1,250.50"\r\n2026-07-02,"Said ""hello""",50',
    );
    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.headers).toEqual(["Date", "Description", "Amount"]);
    expect(parsed.rows).toEqual([
      { rowNumber: 2, values: ["2026-07-01", "Groceries, weekly", "1,250.50"] },
      { rowNumber: 3, values: ["2026-07-02", 'Said "hello"', "50"] },
    ]);
  });

  it("detects and selects a header after introductory records", () => {
    const source = [
      "BPI Statement of Account",
      "Account,1234",
      "",
      "Transaction Date,Description,Debit,Credit",
      "7/1/2026,Market,50.00,",
    ].join("\n");

    expect(inspectCsv(source).suggestedHeaderRowNumber).toBe(4);
    expect(parseCsv(source, { headerRowNumber: 4 })).toEqual({
      headerRowNumber: 4,
      headers: ["Transaction Date", "Description", "Debit", "Credit"],
      rows: [{ rowNumber: 5, values: ["7/1/2026", "Market", "50.00", ""] }],
    });
  });

  it("preserves physical source row numbers while ignoring blank records", () => {
    const parsed = parseCsv(
      "Report generated today\n\nDate,Description,Amount\n\n2026-07-01,Market,-50",
      {
        headerRowNumber: 3,
      },
    );

    expect(parsed.rows).toEqual([{ rowNumber: 5, values: ["2026-07-01", "Market", "-50"] }]);
  });

  it("falls back to the first plausible record when no semantic header is found", () => {
    expect(inspectCsv("When,What,Value in PHP\nToday,Market,50").suggestedHeaderRowNumber).toBe(1);
  });

  it("keeps punctuation-distinct and non-Latin headers usable", () => {
    expect(parseCsv("Amount (PHP),Amount PHP\n1,2").headers).toEqual([
      "Amount (PHP)",
      "Amount PHP",
    ]);
    expect(parseCsv("日付,説明\n2026-07-01,市場").headers).toEqual(["日付", "説明"]);
  });

  it("rejects missing selected headers, duplicate headers, and unclosed quotes", () => {
    expect(() => parseCsv("Date,date\n1,2")).toThrow(CsvParseError);
    expect(() => parseCsv("Date,Description\n2026-07-01,Market", { headerRowNumber: 9 })).toThrow(
      "The selected CSV header row could not be found.",
    );
    expect(() => parseCsv('Date,Description\n2026-07-01,"Open')).toThrow(CsvParseError);
  });
});
