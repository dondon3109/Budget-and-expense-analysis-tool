import {
  createImportFingerprint,
  detectImportPreset,
  resolvePresetMapping,
  type ImportAmountMode,
  type ImportMapping,
  type ImportPreset,
} from "@zoption/shared";

/**
 * Guided first-run import: exactly 3 steps (choose file → map columns →
 * review & import). The heavy lifting stays in the reused engines —
 * shared CSV/workbook parsing, preset auto-mapping, and the server preview
 * that flags duplicates. This module only adds the thin first-run glue:
 * step copy, the auto-map entry point, and an instant within-file duplicate
 * check that runs before the server round trip.
 */
export const FIRST_RUN_IMPORT_STEPS = [
  { id: "choose", title: "Choose file", detail: "Pick a CSV or Excel bank statement." },
  { id: "map", title: "Map columns", detail: "Confirm date, merchant, and amount columns." },
  { id: "review", title: "Review & import", detail: "Duplicates are skipped, then confirm." },
] as const;

export type FirstRunImportStepId = (typeof FIRST_RUN_IMPORT_STEPS)[number]["id"];

export function firstRunStepIndex(step: "choose" | "configure" | "preview" | "done"): number {
  if (step === "choose") return 0;
  if (step === "configure") return 1;
  return 2;
}

export interface FirstRunColumnMapping {
  preset: ImportPreset;
  mapping: ImportMapping;
  amountMode: ImportAmountMode;
}

/**
 * Sensible auto-map for the mapping step. Reuses preset detection plus the
 * shared alias tables (date, merchant/description, amount or debit+credit,
 * account/category) — no second mapping engine.
 */
export function autoMapFirstRunColumns(
  fileName: string,
  headers: string[],
): FirstRunColumnMapping {
  const preset = detectImportPreset(fileName, headers);
  const { mapping, amountMode } = resolvePresetMapping(headers, preset);
  return { preset, mapping, amountMode };
}

export interface FirstRunDedupeRow {
  date: string;
  amountMinor: number;
  description: string;
  /** Same value for every row of one file (e.g. the file name): one file is one account context. */
  accountSource: string;
}

/**
 * Flags within-file repeats using the same fingerprint the server uses for
 * import dedupe (`createImportFingerprint`). The server remains the authority
 * for already-imported rows; this instant local pass only catches rows that
 * repeat inside the file itself, so the review step can say so without
 * another round trip. Order-preserving: result[i] answers rows[i].
 */
export async function markFirstRunDuplicates(rows: FirstRunDedupeRow[]): Promise<boolean[]> {
  const fingerprints = await Promise.all(
    rows.map((row) =>
      createImportFingerprint({
        date: row.date,
        amountMinor: row.amountMinor,
        description: row.description,
        accountSource: row.accountSource,
      }),
    ),
  );
  const seen = new Set<string>();
  return fingerprints.map((fingerprint) => {
    if (seen.has(fingerprint)) return true;
    seen.add(fingerprint);
    return false;
  });
}

export async function countFirstRunDuplicates(rows: FirstRunDedupeRow[]): Promise<number> {
  const flags = await markFirstRunDuplicates(rows);
  return flags.filter(Boolean).length;
}
