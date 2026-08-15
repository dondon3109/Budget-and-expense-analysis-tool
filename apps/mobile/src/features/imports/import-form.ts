import {
  detectImportPreset,
  importPreviewRequestSchema,
  resolvePresetMapping,
  type ImportMapping,
  type ImportPreset,
  type ImportPresetId,
  type ImportPreviewRequest,
} from "@zoption/shared";

export const MAX_IMPORT_FILE_BYTES = 5_000_000;
export const MAX_CSV_FILE_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 500;

export type ImportFileKind = "csv" | "workbook" | "unsupported";

export function importFileKind(fileName: string): ImportFileKind {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".csv") || normalized.endsWith(".txt")) return "csv";
  if (normalized.endsWith(".xlsx") || normalized.endsWith(".xls")) return "workbook";
  return "unsupported";
}

export interface ImportMappingState {
  presetId: ImportPresetId;
  mapping: ImportMapping;
  fallbackDate: string;
}

export function presetForFile(fileName: string, headers: string[]): ImportPreset {
  return detectImportPreset(fileName, headers);
}

export function mappingForPreset(headers: string[], preset: ImportPreset): ImportMapping {
  return resolvePresetMapping(headers, preset).mapping;
}

export function initialMappingState(fileName: string, headers: string[]): ImportMappingState {
  const preset = presetForFile(fileName, headers);
  return {
    presetId: preset.id,
    mapping: mappingForPreset(headers, preset),
    fallbackDate: "",
  };
}

export interface MappingProblem {
  path: "amount" | "date" | "columns";
  message: string;
}

/**
 * Mirrors the server's mapping rules so the user can correct mistakes before
 * a network round trip. The server re-validates every request and remains the
 * authority.
 */
export function mappingProblems(
  state: ImportMappingState,
  headers: string[],
): MappingProblem[] {
  const mapping = state.mapping;
  const problems: MappingProblem[] = [];
  const usesAmount = Boolean(mapping.amount);
  const usesDebit = Boolean(mapping.debit);
  const usesCredit = Boolean(mapping.credit);
  if (!((usesAmount && !usesDebit && !usesCredit) || (!usesAmount && usesDebit && usesCredit))) {
    problems.push({
      path: "amount",
      message: "Choose one Amount column or both Debit and Credit columns.",
    });
  }
  if (!mapping.date && !state.fallbackDate) {
    problems.push({
      path: "date",
      message: "Choose a Date column or enter one date for every row.",
    });
  }
  const columns = Object.values(mapping)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.trim().toLowerCase());
  if (new Set(columns).size !== columns.length) {
    problems.push({
      path: "columns",
      message: "Each mapped field must use a different source column.",
    });
  }
  const known = new Set(headers.map((header) => header.trim().toLowerCase()));
  for (const column of columns) {
    if (!known.has(column)) {
      problems.push({
        path: "columns",
        message: "Every mapped field must come from the file's columns.",
      });
      break;
    }
  }
  return problems;
}

export function buildImportPreviewRequest(
  fileName: string,
  csvText: string,
  headerRowNumber: number,
  state: ImportMappingState,
): ImportPreviewRequest {
  const input = {
    fileName,
    csvText,
    headerRowNumber,
    mapping: state.mapping,
    fallbackDate: state.mapping.date ? undefined : state.fallbackDate || undefined,
  };
  const parsed = importPreviewRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      "The import setup is incomplete. Check the mapped columns and try again.",
    );
  }
  return parsed.data;
}

export const importKindLabels: Record<"expense" | "income" | "transfer", string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export const importPresetLabels: Record<ImportPresetId, string> = {
  auto: "Auto-detect",
  generic: "Generic bank export",
  bpi: "BPI",
  bdo: "BDO",
  maribank: "MariBank",
  "bank-of-america": "Bank of America",
  jpmorgan: "JPMorgan / Chase",
};
