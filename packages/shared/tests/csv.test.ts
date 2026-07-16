import { describe, expect, it } from "vitest";

import { CsvParseError, parseCsv } from "../src/csv";

describe("CSV parsing", () => {
  it("parses quoted commas, quotes, and line endings", () => {
    const parsed = parseCsv(
      '\uFEFFDate,Description,Amount\r\n2026-07-01,"Groceries, weekly","1,250.50"\r\n2026-07-02,"Said ""hello""",50',
    );
    expect(parsed.headers).toEqual(["Date", "Description", "Amount"]);
    expect(parsed.rows).toEqual([
      { rowNumber: 2, values: ["2026-07-01", "Groceries, weekly", "1,250.50"] },
      { rowNumber: 3, values: ["2026-07-02", 'Said "hello"', "50"] },
    ]);
  });

  it("rejects duplicate headers and unclosed quotes", () => {
    expect(() => parseCsv("Date,date\n1,2")).toThrow(CsvParseError);
    expect(() => parseCsv('Date,Description\n2026-07-01,"Open')).toThrow(CsvParseError);
  });
});
