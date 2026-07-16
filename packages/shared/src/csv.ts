export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export interface ParsedCsv {
  headers: string[];
  rows: Array<{ rowNumber: number; values: string[] }>;
}

export function parseCsv(source: string): ParsedCsv {
  const text = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  function finishField() {
    record.push(field);
    field = "";
  }

  function finishRecord() {
    finishField();
    if (record.some((value) => value.trim() !== "")) records.push(record);
    record = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRecord();
    } else if (character === "\r") {
      if (text[index + 1] === "\n") index += 1;
      finishRecord();
    } else {
      field += character;
    }
  }

  if (quoted) throw new CsvParseError("The CSV contains an unclosed quoted value.");
  if (field.length > 0 || record.length > 0) finishRecord();
  if (records.length === 0) throw new CsvParseError("The CSV is empty.");

  const headers = records[0]!.map((value) => value.trim());
  if (headers.some((header) => header === "")) {
    throw new CsvParseError("Every CSV column needs a header.");
  }
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase("en"));
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new CsvParseError("CSV headers must be unique.");
  }

  return {
    headers,
    rows: records.slice(1).map((values, index) => ({ rowNumber: index + 2, values })),
  };
}
