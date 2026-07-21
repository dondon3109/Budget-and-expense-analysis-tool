import { describe, expect, it } from "vitest";
import { utils, write, type BookType, type WorkBook } from "xlsx";

import {
  MAX_WORKBOOK_FILE_BYTES,
  WorkbookImportError,
  convertWorksheet,
  inspectWorkbook,
} from "../src/lib/workbookParser";

function workbookBuffer(workbook: WorkBook, bookType: BookType = "xlsx"): ArrayBuffer {
  const output: unknown = write(workbook, { type: "array", bookType });
  if (output instanceof ArrayBuffer) return output;
  if (ArrayBuffer.isView(output)) {
    const copy = new Uint8Array(output.byteLength);
    copy.set(new Uint8Array(output.buffer, output.byteOffset, output.byteLength));
    return copy.buffer;
  }
  throw new Error("SheetJS did not return an array buffer.");
}

function transactionWorkbook(): WorkBook {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([["Instructions"], ["Choose Transactions"]]),
    "Instructions",
  );
  const transactions = utils.aoa_to_sheet([]);
  utils.sheet_add_aoa(
    transactions,
    [
      ["Date", "Description", "Amount", "Category"],
      [new Date(2026, 6, 20), 'Market, "weekly"\nshop', -1250.5, "Food & dining"],
      [new Date(2026, 6, 21), "Salary", 8000, "Salary"],
    ],
    { origin: "B3", cellDates: true },
  );
  transactions.D5 = { t: "n", f: "4000*2", v: 8000 };
  transactions["!ref"] = "B3:E5";
  utils.book_append_sheet(workbook, transactions, "Transactions");
  return workbook;
}

describe("Excel workbook parsing", () => {
  it.each(["xlsx", "xls"] as const)(
    "discovers and converts worksheets from %s files",
    (bookType) => {
      const buffer = workbookBuffer(transactionWorkbook(), bookType);

      expect(inspectWorkbook(buffer)).toEqual(["Instructions", "Transactions"]);
      const converted = convertWorksheet(buffer, "Transactions");

      expect(converted.headers).toEqual(["Date", "Description", "Amount", "Category"]);
      expect(converted.rowCount).toBe(2);
      expect(converted.csvText).toContain("2026-07-20");
      expect(converted.csvText).toContain('"Market, ""weekly""\nshop"');
      expect(converted.csvText).toContain("-1250.5");
      expect(converted.csvText).not.toContain("Instructions");
      if (bookType === "xlsx") {
        expect(converted.warnings).toContain(
          "Formula cells use their last saved results and are not recalculated during import.",
        );
      }
    },
  );

  it("warns when a formula has no saved result", () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Date", "Description", "Amount", "Category"],
      ["2026-07-20", "Market", -50, "Food & dining"],
    ]);
    sheet.C2 = { t: "n", f: "1+1" };
    sheet["!ref"] = "A1:D2";
    utils.book_append_sheet(workbook, sheet, "Transactions");

    const converted = convertWorksheet(workbookBuffer(workbook), "Transactions");

    expect(converted.warnings).toContain(
      "1 formula cell has no saved result and will be left blank.",
    );
    expect(converted.csvText).not.toContain("1+1");
  });

  it("rejects empty sheets and duplicate headers", () => {
    const emptyWorkbook = utils.book_new();
    utils.book_append_sheet(emptyWorkbook, utils.aoa_to_sheet([]), "Empty");
    expect(() => convertWorksheet(workbookBuffer(emptyWorkbook), "Empty")).toThrow(
      "The selected worksheet is empty.",
    );

    const duplicateWorkbook = utils.book_new();
    utils.book_append_sheet(
      duplicateWorkbook,
      utils.aoa_to_sheet([
        ["Date", "date"],
        ["2026-07-20", "2026-07-21"],
      ]),
      "Duplicate",
    );
    expect(() => convertWorksheet(workbookBuffer(duplicateWorkbook), "Duplicate")).toThrow(
      "CSV headers must be unique.",
    );
  });

  it("rejects worksheets over 500 data rows", () => {
    const workbook = utils.book_new();
    const rows = [
      ["Date", "Description", "Amount", "Category"],
      ...Array.from({ length: 501 }, (_, index) => [
        "2026-07-20",
        `Transaction ${index + 1}`,
        -1,
        "Food & dining",
      ]),
    ];
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), "Transactions");

    expect(() => convertWorksheet(workbookBuffer(workbook), "Transactions")).toThrow(
      "The selected worksheet contains more than 500 data rows.",
    );
  });

  it("rejects oversized and malformed workbooks", () => {
    expect(() => inspectWorkbook(new ArrayBuffer(MAX_WORKBOOK_FILE_BYTES + 1))).toThrow(
      WorkbookImportError,
    );
    expect(() => inspectWorkbook(new TextEncoder().encode("not a workbook").buffer)).toThrow(
      WorkbookImportError,
    );
  });
});
