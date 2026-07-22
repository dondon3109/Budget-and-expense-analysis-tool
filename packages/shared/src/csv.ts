export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export interface ParsedCsv {
  headerRowNumber: number;
  headers: string[];
  rows: Array<{ rowNumber: number; values: string[] }>;
}

export interface CsvHeaderCandidate {
  rowNumber: number;
  values: string[];
  score: number;
}

export interface CsvInspection {
  suggestedHeaderRowNumber: number;
  candidates: CsvHeaderCandidate[];
}

export interface ParseCsvOptions {
  headerRowNumber?: number;
}

interface CsvRecord {
  rowNumber: number;
  values: string[];
}

const HEADER_SCAN_LIMIT = 25;

const headerAliases = {
  date: new Set(["date", "transaction date", "posting date", "posted date", "post date"]),
  description: new Set([
    "description",
    "details",
    "particulars",
    "transaction details",
    "merchant",
    "memo",
    "narration",
    "payee",
  ]),
  amount: new Set(["amount", "transaction amount", "value"]),
  debit: new Set(["debit", "debit amount", "withdrawal", "withdrawals"]),
  credit: new Set(["credit", "credit amount", "deposit", "deposits"]),
  category: new Set(["category", "category name"]),
  kind: new Set(["type", "kind", "transaction type"]),
  currency: new Set(["currency", "currency code"]),
};

export function normalizeCsvHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIdentity(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function tokenizeCsv(source: string): CsvRecord[] {
  const text = source.startsWith(String.fromCharCode(0xfeff)) ? source.slice(1) : source;
  const records: CsvRecord[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let rowNumber = 1;

  function finishField() {
    record.push(field);
    field = "";
  }

  function finishRecord() {
    finishField();
    records.push({ rowNumber, values: record });
    rowNumber += 1;
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
  return records;
}

function isNonblank(record: CsvRecord): boolean {
  return record.values.some((value) => value.trim() !== "");
}

function validateHeaders(values: string[]): string[] {
  const headers = values.map((value) => value.trim());
  if (headers.some((header) => header === "")) {
    throw new CsvParseError("Every CSV column needs a header.");
  }
  const identities = headers.map(headerIdentity);
  if (new Set(identities).size !== identities.length) {
    throw new CsvParseError("CSV headers must be unique.");
  }
  return headers;
}

function scoreHeader(values: string[], next?: CsvRecord): number {
  const identities = values.map(headerIdentity);
  if (identities.length < 2 || identities.some((value) => !value)) return -1;
  if (new Set(identities).size !== identities.length) return -1;
  const normalized = values.map(normalizeCsvHeader);

  const has = (role: keyof typeof headerAliases) =>
    normalized.some((value) => headerAliases[role].has(value));
  let score = 0;
  if (has("description")) score += 4;
  if (has("amount")) score += 4;
  if (has("debit") && has("credit")) score += 4;
  if (has("date")) score += 2;
  if (has("category")) score += 1;
  if (has("kind")) score += 1;
  if (has("currency")) score += 1;
  if (next?.values.length === values.length) score += 1;
  return score;
}

export function inspectCsv(source: string): CsvInspection {
  const records = tokenizeCsv(source);
  const nonblank = records.filter(isNonblank);
  if (nonblank.length === 0) throw new CsvParseError("The CSV is empty.");

  const inspected = nonblank.slice(0, HEADER_SCAN_LIMIT);
  const candidates = inspected
    .map((record, index) => ({
      rowNumber: record.rowNumber,
      values: record.values.map((value) => value.trim()),
      score: scoreHeader(record.values, inspected[index + 1]),
    }))
    .filter((candidate) => candidate.score >= 0);
  const strongest = candidates.reduce<CsvHeaderCandidate | undefined>(
    (best, candidate) => (!best || candidate.score > best.score ? candidate : best),
    undefined,
  );
  const suggested = strongest && strongest.score >= 6 ? strongest : candidates[0];

  return {
    suggestedHeaderRowNumber: suggested?.rowNumber ?? nonblank[0]!.rowNumber,
    candidates,
  };
}

export function parseCsv(source: string, options: ParseCsvOptions = {}): ParsedCsv {
  const records = tokenizeCsv(source);
  const nonblank = records.filter(isNonblank);
  if (nonblank.length === 0) throw new CsvParseError("The CSV is empty.");

  const headerRowNumber = options.headerRowNumber ?? nonblank[0]!.rowNumber;
  const headerRecord = nonblank.find((record) => record.rowNumber === headerRowNumber);
  if (!headerRecord) throw new CsvParseError("The selected CSV header row could not be found.");
  const headers = validateHeaders(headerRecord.values);

  return {
    headerRowNumber,
    headers,
    rows: nonblank
      .filter((record) => record.rowNumber > headerRowNumber)
      .map((record) => ({ rowNumber: record.rowNumber, values: record.values })),
  };
}
