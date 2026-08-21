import type { CellObject, WorkBook, WorkSheet } from "xlsx";
import type * as xlsxTypes from "xlsx";

type XlsxModule = typeof xlsxTypes;

let xlsxModulePromise: Promise<XlsxModule> | null = null;

/**
 * SheetJS is large and only needed by the import flows, so it is evaluated on
 * first use instead of whenever the shared barrel is imported. Metro keeps
 * dynamic imports in the same native bundle but defers their evaluation until
 * this promise first resolves; web bundlers split them into a separate chunk.
 */
function loadXlsx(): Promise<XlsxModule> {
  xlsxModulePromise ??= import("xlsx");
  return xlsxModulePromise;
}

export const MAX_WORKBOOK_FILE_BYTES = 5_000_000;
const MAX_CANONICAL_CSV_BYTES = 1_000_000;
export const MAX_XLSX_ZIP_ENTRIES = 2_000;
export const MAX_XLSX_CENTRAL_DIRECTORY_BYTES = 1_000_000;
export const MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES = 20_000_000;
export const MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES = 40_000_000;
export const MAX_WORKBOOK_SHEETS = 100;
export const MAX_WORKSHEET_CELLS = 100_000;
export const MAX_WORKSHEET_ROWS = 10_000;
export const MAX_WORKSHEET_COLUMNS = 256;
const MAX_ZIP_COMPRESSION_RATIO = 500;
const MAX_CELL_TEXT_CHARACTERS = 100_000;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;
const CELL_ADDRESS_PATTERN = /^[A-Z]{1,3}[1-9]\d*$/i;

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

function failUnsafeWorkbook(): never {
  throw new WorkbookImportError(
    "This workbook contains more data than can be processed safely. Try exporting a smaller workbook.",
  );
}

function findZipEndOfCentralDirectory(view: DataView): number {
  if (view.byteLength < 22) failUnsafeWorkbook();
  const minimumOffset = Math.max(0, view.byteLength - 22 - 65_535);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength <= view.byteLength) return offset;
  }
  failUnsafeWorkbook();
}

function zipDataDescriptorEnd(
  view: DataView,
  dataEnd: number,
  centralDirectoryOffset: number,
  crc32: number,
  compressedBytes: number,
  uncompressedBytes: number,
): number {
  const unsignedDescriptorEnd = dataEnd + 12;
  if (unsignedDescriptorEnd > centralDirectoryOffset) failUnsafeWorkbook();

  const firstField = view.getUint32(dataEnd, true);
  const unsignedDescriptorMatches =
    firstField === crc32 &&
    view.getUint32(dataEnd + 4, true) === compressedBytes &&
    view.getUint32(dataEnd + 8, true) === uncompressedBytes;

  if (firstField === ZIP_DATA_DESCRIPTOR_SIGNATURE) {
    const signedDescriptorEnd = dataEnd + 16;
    if (
      signedDescriptorEnd <= centralDirectoryOffset &&
      view.getUint32(dataEnd + 4, true) === crc32 &&
      view.getUint32(dataEnd + 8, true) === compressedBytes &&
      view.getUint32(dataEnd + 12, true) === uncompressedBytes
    ) {
      return signedDescriptorEnd;
    }
  }

  // An unsigned descriptor whose CRC happens to equal the optional signature
  // is ambiguous, so validate it as the 12-byte form if the signed form did not
  // match.
  if (unsignedDescriptorMatches) return unsignedDescriptorEnd;
  failUnsafeWorkbook();
}

function assertZipMetadata(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const endOffset = findZipEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(endOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);

  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === ZIP64_UINT16_SENTINEL ||
    centralDirectorySize === ZIP64_UINT32_SENTINEL ||
    centralDirectoryOffset === ZIP64_UINT32_SENTINEL ||
    entryCount > MAX_XLSX_ZIP_ENTRIES ||
    centralDirectorySize > MAX_XLSX_CENTRAL_DIRECTORY_BYTES ||
    centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    failUnsafeWorkbook();
  }

  let position = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let totalUncompressedBytes = 0;
  // End (exclusive) of the previous entry, including any data descriptor, used
  // to prove that no entry overlaps another local header or the central directory.
  let previousDataEnd = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      position + 46 > centralDirectoryEnd ||
      view.getUint32(position, true) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      failUnsafeWorkbook();
    }

    const centralGeneralPurposeFlag = view.getUint16(position + 8, true);
    const crc32 = view.getUint32(position + 16, true);
    const compressedBytes = view.getUint32(position + 20, true);
    const uncompressedBytes = view.getUint32(position + 24, true);
    const fileNameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const diskStart = view.getUint16(position + 34, true);
    const localHeaderOffset = view.getUint32(position + 42, true);
    const nextPosition = position + 46 + fileNameLength + extraLength + commentLength;

    if (
      diskStart !== 0 ||
      compressedBytes === ZIP64_UINT32_SENTINEL ||
      uncompressedBytes === ZIP64_UINT32_SENTINEL ||
      localHeaderOffset === ZIP64_UINT32_SENTINEL ||
      nextPosition > centralDirectoryEnd ||
      uncompressedBytes > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES ||
      (uncompressedBytes > 0 &&
        (compressedBytes === 0 ||
          uncompressedBytes / compressedBytes > MAX_ZIP_COMPRESSION_RATIO)) ||
      localHeaderOffset < previousDataEnd ||
      localHeaderOffset + 30 > centralDirectoryOffset ||
      view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_FILE_SIGNATURE
    ) {
      failUnsafeWorkbook();
    }

    const generalPurposeFlag = view.getUint16(localHeaderOffset + 6, true);
    const localCompressionMethod = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedBytes = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedBytes = view.getUint32(localHeaderOffset + 22, true);
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const hasDataDescriptor = (generalPurposeFlag & 0x08) !== 0;

    if (
      generalPurposeFlag !== centralGeneralPurposeFlag ||
      localFileNameLength !== fileNameLength ||
      localCompressionMethod !== view.getUint16(position + 10, true) ||
      localHeaderOffset + 30 + localFileNameLength > centralDirectoryOffset
    ) {
      failUnsafeWorkbook();
    }

    for (let charIndex = 0; charIndex < fileNameLength; charIndex += 1) {
      if (
        view.getUint8(position + 46 + charIndex) !==
        view.getUint8(localHeaderOffset + 30 + charIndex)
      ) {
        failUnsafeWorkbook();
      }
    }

    if (hasDataDescriptor) {
      // Descriptor entries may leave local CRC and size fields at zero. Any
      // populated local value must still agree with the central directory.
      if (
        (localCrc32 !== 0 && localCrc32 !== crc32) ||
        (localCompressedBytes !== 0 && localCompressedBytes !== compressedBytes) ||
        (localUncompressedBytes !== 0 && localUncompressedBytes !== uncompressedBytes)
      ) {
        failUnsafeWorkbook();
      }
    } else if (
      localCrc32 !== crc32 ||
      localCompressedBytes !== compressedBytes ||
      localUncompressedBytes !== uncompressedBytes
    ) {
      failUnsafeWorkbook();
    }

    const compressedDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    // The real compressed size is authoritative for both kinds of entry, so the
    // payload must fit before the central directory and before the next entry's
    // local header (checked on the next iteration via previousDataEnd).
    const dataEnd = compressedDataOffset + compressedBytes;
    if (dataEnd > centralDirectoryOffset) failUnsafeWorkbook();

    const entryEnd = hasDataDescriptor
      ? zipDataDescriptorEnd(
          view,
          dataEnd,
          centralDirectoryOffset,
          crc32,
          compressedBytes,
          uncompressedBytes,
        )
      : dataEnd;

    previousDataEnd = entryEnd;
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES) failUnsafeWorkbook();
    position = nextPosition;
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
  if (zip) assertZipMetadata(buffer);
}

function readWorkbook(xlsx: XlsxModule, buffer: ArrayBuffer, sheetName?: string): WorkBook {
  try {
    return xlsx.read(buffer, {
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

function assertWorkbookResources(workbook: WorkBook): void {
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) failUnsafeWorkbook();
  if (workbook.SheetNames.some((name) => name.length > 128)) failUnsafeWorkbook();
}

export async function inspectWorkbook(buffer: ArrayBuffer): Promise<string[]> {
  const xlsx = await loadXlsx();
  assertWorkbook(buffer);
  const workbook = readWorkbook(xlsx, buffer);
  assertWorkbookResources(workbook);
  if (workbook.SheetNames.length === 0) {
    throw new WorkbookImportError("The workbook does not contain any worksheets.");
  }
  return workbook.SheetNames;
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

function assertCellTextBounds(cell: CellObject | undefined): void {
  if (!cell) return;
  if (typeof cell.v === "string" && cell.v.length > MAX_CELL_TEXT_CHARACTERS) failUnsafeWorkbook();
  if (typeof cell.f === "string" && cell.f.length > MAX_CELL_TEXT_CHARACTERS) failUnsafeWorkbook();
  if (typeof cell.w === "string" && cell.w.length > MAX_CELL_TEXT_CHARACTERS) failUnsafeWorkbook();
}

function cellValue(cell: CellObject | undefined, state: CellConversionState): string {
  if (!cell) return "";
  assertCellTextBounds(cell);
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

function worksheetCells(
  xlsx: XlsxModule,
  sheet: WorkSheet,
): Array<{ address: string; r: number; c: number }> {
  const addresses = Object.keys(sheet).filter((key) => !key.startsWith("!"));
  if (addresses.length > MAX_WORKSHEET_CELLS) failUnsafeWorkbook();

  return addresses.map((address) => {
    if (!CELL_ADDRESS_PATTERN.test(address)) failUnsafeWorkbook();
    const position = xlsx.utils.decode_cell(address);
    if (position.r >= MAX_WORKSHEET_ROWS || position.c >= MAX_WORKSHEET_COLUMNS) {
      failUnsafeWorkbook();
    }
    return { address, ...position };
  });
}

function worksheetRows(xlsx: XlsxModule, sheet: WorkSheet, state: CellConversionState): string[][] {
  const inspectionState: CellConversionState = { formulaCount: 0, missingFormulaValueCount: 0 };
  const populated = worksheetCells(xlsx, sheet)
    .map(({ address, r, c }) => {
      const value = cellValue(sheet[address] as CellObject | undefined, inspectionState);
      return { r, c, value };
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
      const address = xlsx.utils.encode_cell({ r: row, c: column });
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

export async function convertWorksheet(
  buffer: ArrayBuffer,
  sheetName: string,
): Promise<WorkbookConversion> {
  const xlsx = await loadXlsx();
  assertWorkbook(buffer);
  const workbook = readWorkbook(xlsx, buffer, sheetName);
  assertWorkbookResources(workbook);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new WorkbookImportError("The selected worksheet could not be found.");

  const state: CellConversionState = { formulaCount: 0, missingFormulaValueCount: 0 };
  const rows = worksheetRows(xlsx, sheet, state);
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
