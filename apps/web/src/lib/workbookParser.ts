import { read, utils, type CellObject, type WorkSheet } from "xlsx";

export const MAX_WORKBOOK_FILE_BYTES = 5_000_000;
const MAX_CANONICAL_CSV_BYTES = 1_000_000;

export interface WorkbookConversion {
  csvText: string;
  rowCount: number;
  warnings: string[];
}

export class WorkbookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookImportError";
  }
}

function assertWorkbook(buffer: ArrayBuffer): void {
  if (buffer.byteLength > MAX_WORKBOOK_FILE_BYTES) {
    throw new WorkbookImportError("Excel workbooks must be 5 MB or smaller.");
  }
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  const zip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08));
  const compound = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
    (value, index) => bytes[index] === value,
  );
  if (!zip && !compound) {
    throw new WorkbookImportError(
      "This file is not a valid XLSX or XLS workbook. Choose the original Excel file and try again.",
    );
  }
}

function readWorkbook(buffer: ArrayBuffer, sheetName?: string) {
  try {
    return read(buffer, {
      type: "array",
      ...(sheetName ? { sheets: [sheetName] } : { bookSheets: true }),
      cellDates: true,
      cellFormula: true,
      cellHTML: false,
      cellText: false,
      dense: false,
      nodim: true,
      UTC: false,
    });
  } catch {
    throw new WorkbookImportError(
      "This workbook could not be opened. It may be damaged, password-protected, or use an unsupported format.",
    );
  }
}

export function inspectWorkbook(buffer: ArrayBuffer): string[] {
  assertWorkbook(buffer);
  const sheetNames = readWorkbook(buffer).SheetNames;
  if (sheetNames.length === 0) {
    throw new WorkbookImportError("The workbook does not contain any worksheets.");
  }
  return sheetNames;
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number): string {
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumSignificantDigits: 21,
  });
}

interface CellConversionState {
  formulaCount: number;
  missingFormulaValueCount: number;
}

function cellValue(cell: CellObject | undefined, state: CellConversionState): string {
  if (!cell) return "";
  if (cell.f) {
    state.formulaCount += 1;
    if (cell.v === undefined || cell.v === null) {
      state.missingFormulaValueCount += 1;
      return "";
    }
  }

  const value = cell.v;
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (cell.t === "e") return cell.w ?? "#ERROR!";
  return String(value);
}

function csvField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function worksheetRows(sheet: WorkSheet, state: CellConversionState): string[][] {
  const inspectionState: CellConversionState = { formulaCount: 0, missingFormulaValueCount: 0 };
  const populated = Object.keys(sheet)
    .filter((key) => !key.startsWith("!"))
    .map((address) => {
      const position = utils.decode_cell(address);
      const value = cellValue(sheet[address] as CellObject | undefined, inspectionState);
      return { ...position, value };
    })
    .filter((cell) => cell.value.trim() !== "");

  if (populated.length === 0) {
    throw new WorkbookImportError("The selected worksheet is empty.");
  }

  const minRow = Math.min(...populated.map((cell) => cell.r));
  const maxRow = Math.max(...populated.map((cell) => cell.r));
  const minColumn = Math.min(...populated.map((cell) => cell.c));
  const maxColumn = Math.max(...populated.map((cell) => cell.c));
  const populatedColumns = new Set(populated.map((cell) => cell.c));
  const columns = Array.from(
    { length: maxColumn - minColumn + 1 },
    (_, index) => minColumn + index,
  ).filter((column) => populatedColumns.has(column));
  const rows: string[][] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    const values = columns.map((column) => {
      const address = utils.encode_cell({ r: row, c: column });
      return cellValue(sheet[address] as CellObject | undefined, state);
    });
    if (values.some((value) => value.trim() !== "")) rows.push(values);
  }

  return rows;
}

function serializeWorksheetRows(rows: string[][]): string {
  const csvText = rows.map((row) => row.map(csvField).join(",")).join("\n");
  if (new TextEncoder().encode(csvText).byteLength > MAX_CANONICAL_CSV_BYTES) {
    throw new WorkbookImportError(
      "The selected worksheet is larger than the 1 MB import limit after conversion.",
    );
  }
  return csvText;
}

export function convertWorksheet(buffer: ArrayBuffer, sheetName: string): WorkbookConversion {
  assertWorkbook(buffer);
  const workbook = readWorkbook(buffer, sheetName);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new WorkbookImportError("The selected worksheet could not be found.");

  const state: CellConversionState = { formulaCount: 0, missingFormulaValueCount: 0 };
  const rows = worksheetRows(sheet, state);
  const csvText = serializeWorksheetRows(rows);
  const warnings: string[] = [];
  if (state.formulaCount > 0) {
    warnings.push(
      "Formula cells use their last saved results and are not recalculated during import.",
    );
  }
  if (state.missingFormulaValueCount > 0) {
    warnings.push(
      `${state.missingFormulaValueCount} formula ${state.missingFormulaValueCount === 1 ? "cell has" : "cells have"} no saved result and will be left blank.`,
    );
  }

  return {
    csvText,
    rowCount: rows.length,
    warnings,
  };
}
