import { parseCsv } from "@zoption/shared";
import { describe, expect, it } from "vitest";
import { utils, write, type BookType, type WorkBook } from "xlsx";

import {
  MAX_WORKBOOK_FILE_BYTES,
  MAX_WORKBOOK_SHEETS,
  MAX_WORKSHEET_ROWS,
  MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_XLSX_ZIP_ENTRIES,
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

function findZipEndOfCentralDirectory(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  for (let offset = buffer.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Test workbook is missing ZIP metadata.");
}

function withDeclaredZipEntryCount(buffer: ArrayBuffer, entryCount: number): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const endOffset = findZipEndOfCentralDirectory(copy);
  view.setUint16(endOffset + 8, entryCount, true);
  view.setUint16(endOffset + 10, entryCount, true);
  return copy;
}

function withFirstEntryUncompressedBytes(buffer: ArrayBuffer, byteLength: number): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const endOffset = findZipEndOfCentralDirectory(copy);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  view.setUint32(centralDirectoryOffset + 24, byteLength, true);
  return copy;
}

interface FirstEntryLocalHeader {
  offset: number;
  fileNameLength: number;
  extraLength: number;
}

function firstEntryLocalHeader(buffer: ArrayBuffer): FirstEntryLocalHeader {
  const view = new DataView(buffer);
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const offset = view.getUint32(centralDirectoryOffset + 42, true);
  return {
    offset,
    fileNameLength: view.getUint16(offset + 26, true),
    extraLength: view.getUint16(offset + 28, true),
  };
}

function withMismatchedLocalFileName(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  // The first local file name byte can never be NUL, so this cannot match the
  // corresponding central-directory name byte.
  view.setUint8(offset + 30, 0x00);
  return copy;
}

function withMismatchedLocalCompressionMethod(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint16(offset + 8, view.getUint16(offset + 8, true) + 1, true);
  return copy;
}

function withMismatchedLocalCompressedBytes(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint32(offset + 18, view.getUint32(offset + 18, true) + 1, true);
  return copy;
}

function withMismatchedLocalUncompressedBytes(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint32(offset + 22, view.getUint32(offset + 22, true) + 1, true);
  return copy;
}

function firstEntryCentralSizes(buffer: ArrayBuffer): {
  crc32: number;
  compressed: number;
  uncompressed: number;
} {
  const view = new DataView(buffer);
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  return {
    crc32: view.getUint32(centralDirectoryOffset + 16, true),
    compressed: view.getUint32(centralDirectoryOffset + 20, true),
    uncompressed: view.getUint32(centralDirectoryOffset + 24, true),
  };
}

function firstEntryCompressedDataEnd(buffer: ArrayBuffer): number {
  const { offset, fileNameLength, extraLength } = firstEntryLocalHeader(buffer);
  const { compressed } = firstEntryCentralSizes(buffer);
  return offset + 30 + fileNameLength + extraLength + compressed;
}

function firstEntryDataDescriptor(buffer: ArrayBuffer, signed: boolean): Uint8Array {
  const { crc32, compressed, uncompressed } = firstEntryCentralSizes(buffer);
  const descriptor = new ArrayBuffer(signed ? 16 : 12);
  const view = new DataView(descriptor);
  const fieldOffset = signed ? 4 : 0;
  if (signed) view.setUint32(0, 0x08074b50, true);
  view.setUint32(fieldOffset, crc32, true);
  view.setUint32(fieldOffset + 4, compressed, true);
  view.setUint32(fieldOffset + 8, uncompressed, true);
  return new Uint8Array(descriptor);
}

function centralDirectoryEntryPositions(buffer: ArrayBuffer): number[] {
  const view = new DataView(buffer);
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const entryCount = view.getUint16(endOffset + 10, true);
  const positions: number[] = [];
  let position = view.getUint32(endOffset + 16, true);

  for (let index = 0; index < entryCount; index += 1) {
    positions.push(position);
    position +=
      46 +
      view.getUint16(position + 28, true) +
      view.getUint16(position + 30, true) +
      view.getUint16(position + 32, true);
  }
  return positions;
}

function withInsertedFirstEntryDataDescriptor(
  buffer: ArrayBuffer,
  descriptor: Uint8Array,
): ArrayBuffer {
  const insertionOffset = firstEntryCompressedDataEnd(buffer);
  const originalBytes = new Uint8Array(buffer);
  const copy = new Uint8Array(buffer.byteLength + descriptor.byteLength);
  copy.set(originalBytes.subarray(0, insertionOffset));
  copy.set(descriptor, insertionOffset);
  copy.set(originalBytes.subarray(insertionOffset), insertionOffset + descriptor.byteLength);

  const view = new DataView(copy.buffer);
  const oldEndOffset = findZipEndOfCentralDirectory(buffer);
  const oldView = new DataView(buffer);
  const oldCentralDirectoryOffset = oldView.getUint32(oldEndOffset + 16, true);
  const endOffset = oldEndOffset + descriptor.byteLength;
  const centralDirectoryOffset = oldCentralDirectoryOffset + descriptor.byteLength;
  view.setUint32(endOffset + 16, centralDirectoryOffset, true);

  const positions = centralDirectoryEntryPositions(copy.buffer);
  for (const [index, position] of positions.entries()) {
    const localHeaderOffset = view.getUint32(position + 42, true);
    if (localHeaderOffset >= insertionOffset) {
      view.setUint32(position + 42, localHeaderOffset + descriptor.byteLength, true);
    }
    if (index === 0) view.setUint16(position + 8, view.getUint16(position + 8, true) | 0x08, true);
  }

  const { offset } = firstEntryLocalHeader(copy.buffer);
  view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 0x08, true);
  return copy.buffer;
}

function withOverlappingFirstEntryDataDescriptor(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const descriptorOffset = firstEntryCompressedDataEnd(copy);
  if (descriptorOffset !== firstEntryNextLocalHeaderOffset(copy)) {
    throw new Error("Test workbook entries are not contiguous.");
  }

  const descriptor = firstEntryDataDescriptor(copy, false);
  new Uint8Array(copy, descriptorOffset, descriptor.byteLength).set(descriptor);
  const endOffset = findZipEndOfCentralDirectory(copy);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 0x08, true);
  view.setUint16(
    centralDirectoryOffset + 8,
    view.getUint16(centralDirectoryOffset + 8, true) | 0x08,
    true,
  );
  return copy;
}

function firstEntryNextLocalHeaderOffset(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  const endOffset = findZipEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const firstPosition = centralDirectoryOffset;
  const secondPosition =
    firstPosition +
    46 +
    view.getUint16(firstPosition + 28, true) +
    view.getUint16(firstPosition + 30, true) +
    view.getUint16(firstPosition + 32, true);
  return view.getUint32(secondPosition + 42, true);
}

function withDataDescriptorFlagAndOversizedLocalData(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 0x08, true);
  const { offset: _offset, fileNameLength, extraLength } = firstEntryLocalHeader(copy);
  const compressedDataStart = _offset + 30 + fileNameLength + extraLength;
  const endOffset = findZipEndOfCentralDirectory(copy);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  view.setUint16(
    centralDirectoryOffset + 8,
    view.getUint16(centralDirectoryOffset + 8, true) | 0x08,
    true,
  );
  // Claim a compressed size for the entry that pushes its payload past the
  // central directory, so the entry is not safely bounded.
  const oversized = centralDirectoryOffset - compressedDataStart + 100;
  view.setUint32(centralDirectoryOffset + 20, oversized, true);
  return copy;
}

function withFirstEntryOverlappingNextEntry(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset, fileNameLength, extraLength } = firstEntryLocalHeader(copy);
  const compressedDataStart = offset + 30 + fileNameLength + extraLength;
  const nextLocalHeaderOffset = firstEntryNextLocalHeaderOffset(copy);
  const endOffset = findZipEndOfCentralDirectory(copy);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  // Enlarge the first entry's compressed size so its payload spans into the
  // next entry's local header, leaving no safe bound between the two entries.
  const spanning = nextLocalHeaderOffset - compressedDataStart + 10;
  view.setUint32(offset + 18, spanning, true);
  view.setUint32(offset + 22, spanning, true);
  view.setUint32(centralDirectoryOffset + 20, spanning, true);
  view.setUint32(centralDirectoryOffset + 24, spanning, true);
  return copy;
}

function withDataDescriptorFlagAndInvalidDescriptorSizes(buffer: ArrayBuffer): ArrayBuffer {
  const copy = buffer.slice(0);
  const view = new DataView(copy);
  const { offset } = firstEntryLocalHeader(copy);
  view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 0x08, true);
  const { offset: _offset, fileNameLength, extraLength } = firstEntryLocalHeader(copy);
  const compressedDataStart = _offset + 30 + fileNameLength + extraLength;
  const endOffset = findZipEndOfCentralDirectory(copy);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  view.setUint16(
    centralDirectoryOffset + 8,
    view.getUint16(centralDirectoryOffset + 8, true) | 0x08,
    true,
  );
  const { compressed } = firstEntryCentralSizes(copy);
  const descriptorOffset = compressedDataStart + compressed;
  if (descriptorOffset + 16 <= centralDirectoryOffset) {
    // Write a data-descriptor whose reported sizes contradict the central
    // directory, with its signature present so the parser trusts it.
    view.setUint32(descriptorOffset, 0x08074b50, true);
    view.setUint32(descriptorOffset + 4, compressed + 7, true);
    view.setUint32(descriptorOffset + 8, compressed + 7, true);
  }
  return copy;
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
    async (bookType) => {
      const buffer = workbookBuffer(transactionWorkbook(), bookType);

      expect(await inspectWorkbook(buffer)).toEqual(["Instructions", "Transactions"]);
      const converted = await convertWorksheet(buffer, "Transactions");
      const parsed = parseCsv(converted.csvText);

      expect(parsed.headers).toEqual(["Date", "Description", "Amount", "Category"]);
      expect(converted.rowCount).toBe(3);
      expect(parsed.rows).toHaveLength(2);
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

  it("preserves introductory rows so the header can be selected later", async () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["BPI Statement of Account"],
        ["Account", "1234"],
        ["Transaction Date", "Description", "Debit", "Credit"],
        ["7/20/2026", "Market", 50, ""],
      ]),
      "Transactions",
    );

    const converted = await convertWorksheet(workbookBuffer(workbook), "Transactions");

    expect(converted.csvText).toContain("BPI Statement of Account");
    expect(parseCsv(converted.csvText, { headerRowNumber: 3 }).rows).toHaveLength(1);
  });

  it("warns when a formula has no saved result", async () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Date", "Description", "Amount", "Category"],
      ["2026-07-20", "Market", -50, "Food & dining"],
    ]);
    sheet.C2 = { t: "n", f: "1+1" };
    sheet["!ref"] = "A1:D2";
    utils.book_append_sheet(workbook, sheet, "Transactions");

    const converted = await convertWorksheet(workbookBuffer(workbook), "Transactions");

    expect(converted.warnings).toContain(
      "1 formula cell has no saved result and will be left blank.",
    );
    expect(converted.csvText).not.toContain("1+1");
  });

  it("rejects empty sheets but preserves rows for header validation in the UI", async () => {
    const emptyWorkbook = utils.book_new();
    utils.book_append_sheet(emptyWorkbook, utils.aoa_to_sheet([]), "Empty");
    await expect(convertWorksheet(workbookBuffer(emptyWorkbook), "Empty")).rejects.toThrow(
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
    const converted = await convertWorksheet(workbookBuffer(duplicateWorkbook), "Duplicate");
    expect(() => parseCsv(converted.csvText)).toThrow("CSV headers must be unique.");
  });

  it("preserves worksheets over 500 rows for post-header validation", async () => {
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

    expect((await convertWorksheet(workbookBuffer(workbook), "Transactions")).rowCount).toBe(502);
  });

  it("rejects oversized ZIP metadata and declared expansion before workbook parsing", async () => {
    const buffer = workbookBuffer(transactionWorkbook());

    await expect(
      inspectWorkbook(withDeclaredZipEntryCount(buffer, MAX_XLSX_ZIP_ENTRIES + 1)),
    ).rejects.toThrow("more data than can be processed safely");
    await expect(
      inspectWorkbook(
        withFirstEntryUncompressedBytes(buffer, MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES + 1),
      ),
    ).rejects.toThrow("more data than can be processed safely");
  });

  it("rejects ZIP entries whose local header disagrees with the central directory", async () => {
    const buffer = workbookBuffer(transactionWorkbook());

    await expect(inspectWorkbook(withMismatchedLocalFileName(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
    await expect(inspectWorkbook(withMismatchedLocalCompressionMethod(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
    await expect(inspectWorkbook(withMismatchedLocalCompressedBytes(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
    await expect(inspectWorkbook(withMismatchedLocalUncompressedBytes(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
  });

  it.each([
    ["signed", true],
    ["unsigned", false],
  ] as const)("accepts a valid %s data descriptor", async (_label, signed) => {
    const source = workbookBuffer(transactionWorkbook());
    const buffer = withInsertedFirstEntryDataDescriptor(
      source,
      firstEntryDataDescriptor(source, signed),
    );

    expect(await inspectWorkbook(buffer)).toEqual(["Instructions", "Transactions"]);
    expect((await convertWorksheet(buffer, "Transactions")).rowCount).toBe(3);
  });

  it("rejects data-descriptor entries that are incomplete or invalid", async () => {
    const buffer = workbookBuffer(transactionWorkbook());
    const truncatedDescriptor = firstEntryDataDescriptor(buffer, true).subarray(0, 12);

    await expect(
      inspectWorkbook(withInsertedFirstEntryDataDescriptor(buffer, truncatedDescriptor)),
    ).rejects.toThrow("more data than can be processed safely");
    await expect(
      inspectWorkbook(withDataDescriptorFlagAndOversizedLocalData(buffer)),
    ).rejects.toThrow("more data than can be processed safely");
    await expect(
      inspectWorkbook(withDataDescriptorFlagAndInvalidDescriptorSizes(buffer)),
    ).rejects.toThrow("more data than can be processed safely");
  });

  it("rejects a data descriptor that overlaps the next entry's local header", async () => {
    const buffer = workbookBuffer(transactionWorkbook());

    await expect(inspectWorkbook(withOverlappingFirstEntryDataDescriptor(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
  });

  it("rejects a local payload that overlaps the next entry's local header", async () => {
    const buffer = workbookBuffer(transactionWorkbook());

    await expect(inspectWorkbook(withFirstEntryOverlappingNextEntry(buffer))).rejects.toThrow(
      "more data than can be processed safely",
    );
  });

  it("bounds workbook resources and sparse worksheet coordinates above the import parser", async () => {
    const manySheets = utils.book_new();
    for (let index = 0; index < MAX_WORKBOOK_SHEETS + 1; index += 1) {
      utils.book_append_sheet(manySheets, utils.aoa_to_sheet([[index]]), `Sheet ${index + 1}`);
    }
    await expect(inspectWorkbook(workbookBuffer(manySheets))).rejects.toThrow(
      "more data than can be processed safely",
    );

    const sparseWorkbook = utils.book_new();
    const sparseSheet = utils.aoa_to_sheet([["Date"]]);
    const outOfBoundsAddress = `A${MAX_WORKSHEET_ROWS + 1}`;
    sparseSheet[outOfBoundsAddress] = { t: "s", v: "2026-07-20" };
    sparseSheet["!ref"] = `A1:${outOfBoundsAddress}`;
    utils.book_append_sheet(sparseWorkbook, sparseSheet, "Transactions");
    const sparseBuffer = workbookBuffer(sparseWorkbook);

    expect(await inspectWorkbook(sparseBuffer)).toEqual(["Transactions"]);
    await expect(convertWorksheet(sparseBuffer, "Transactions")).rejects.toThrow(
      "more data than can be processed safely",
    );
  });

  it("rejects oversized and malformed workbooks", async () => {
    await expect(inspectWorkbook(new ArrayBuffer(MAX_WORKBOOK_FILE_BYTES + 1))).rejects.toThrow(
      WorkbookImportError,
    );
    await expect(
      inspectWorkbook(new TextEncoder().encode("not a workbook").buffer),
    ).rejects.toThrow(WorkbookImportError);
  });
});
