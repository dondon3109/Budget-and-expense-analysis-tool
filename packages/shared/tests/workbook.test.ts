import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";

import {
  WorkbookImportError,
  convertWorksheet,
  inspectWorkbook,
  MAX_WORKBOOK_FILE_BYTES,
} from "../src/workbook";

function workbookBuffer(): ArrayBuffer {
  const workbook = xlsx.utils.book_new();
  const rows: unknown[][] = [
    ["Date", "Description", "Amount", "Type"],
    [new Date(Date.UTC(2026, 6, 20)), "Weekend groceries", -1250.5, "expense"],
    [new Date(Date.UTC(2026, 6, 21)), 'Comma, "quoted", merchant', 8000, "income"],
    ["2026-07-22", "Fare", -30, "expense"],
  ];
  const sheet = xlsx.utils.aoa_to_sheet(rows, { cellDates: true });
  sheet.C5 = { f: "D2+D3", v: 3 };
  sheet["!ref"] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4, c: 3 } });
  sheet["!ref"] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4, c: 3 } });
  xlsx.utils.book_append_sheet(workbook, sheet, "Transactions");
  const notes = xlsx.utils.aoa_to_sheet([["note"], ["hello"]]);
  xlsx.utils.book_append_sheet(workbook, notes, "Notes");
  const output = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return output.slice(0);
}

describe("workbook conversion shared module", () => {
  it("lists worksheet names", () => {
    expect(inspectWorkbook(workbookBuffer())).toEqual(["Transactions", "Notes"]);
  });

  it("converts a worksheet into canonical CSV text", () => {
    const buffer = workbookBuffer();
    const conversion = convertWorksheet(buffer, "Transactions");
    expect(conversion.rowCount).toBe(5);
    expect(conversion.csvText).toBe(
      [
        "Date,Description,Amount,Type",
        "2026-07-20,Weekend groceries,-1250.5,expense",
        '2026-07-21,"Comma, ""quoted"", merchant",8000,income',
        "2026-07-22,Fare,-30,expense",
        ",,3,",
      ].join("\n"),
    );
  });

  it("reports formula cells as warnings without recalculating", () => {
    const conversion = convertWorksheet(workbookBuffer(), "Transactions");
    expect(conversion.warnings).toEqual([
      "Formula cells use their last saved results and are not recalculated during import.",
    ]);
  });

  it("rejects workbooks larger than the file cap", () => {
    const oversized = new Uint8Array(MAX_WORKBOOK_FILE_BYTES + 1);
    oversized.set([0x50, 0x4b, 0x03, 0x04]);
    expect(() => inspectWorkbook(oversized.buffer)).toThrow(
      new WorkbookImportError("Excel workbooks must be 5 MB or smaller."),
    );
  });

  it("rejects files that are not XLSX or XLS", () => {
    const garbage = new TextEncoder().encode("not a workbook at all").buffer;
    expect(() => inspectWorkbook(garbage)).toThrow(
      new WorkbookImportError(
        "This file is not a valid XLSX or XLS workbook. Choose the original Excel file and try again.",
      ),
    );
  });

  it("rejects an unknown worksheet name", () => {
    expect(() => convertWorksheet(workbookBuffer(), "Missing")).toThrow(
      new WorkbookImportError("The selected worksheet could not be found."),
    );
  });

  it("rejects an empty worksheet", () => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[]]), "Blank");
    const output = xlsx.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(() => convertWorksheet(output.slice(0), "Blank")).toThrow(
      new WorkbookImportError("The selected worksheet is empty."),
    );
  });
});
