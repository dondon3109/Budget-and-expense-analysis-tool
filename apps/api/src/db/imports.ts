import {
  normalizeImportDate,
  parseCsv,
  type ImportCommitRequest,
  type ImportCommitResult,
  type ImportPreview,
  type ImportPreviewRequest,
  type TransactionKind,
} from "@budget/shared";
import { and, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories, importPreviews } from "../../../../db/schema";
import { HttpError } from "../errors";
import { prepareImportRows, type PreparedImportRecord } from "../imports/prepare";
import type { Bindings } from "../types";
import { defaultAccountIdForTenant } from "./tenants";

const MAX_FILE_BYTES = 1_000_000;
const MAX_ROWS = 500;
const PREVIEW_LIFETIME_MS = 15 * 60 * 1000;

export function buildImportTransactionInsertSql(requireNonSystemCategory: boolean): string {
  const systemConstraint = requireNonSystemCategory ? " AND system_key IS NULL" : "";
  return `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, import_fingerprint) VALUES (?, ?, ?, (SELECT id FROM categories WHERE id = ? AND tenant_id = ? AND archived = 0 AND kind = ?${systemConstraint}), ?, ?, ?, 'PHP', ?, ?)`;
}

export function assertImportFileSize(csvText: string): void {
  if (new TextEncoder().encode(csvText).byteLength > MAX_FILE_BYTES) {
    throw new HttpError(413, "file_too_large", "CSV files must be 1 MB or smaller.");
  }
}

export function assertImportRowCount(rowCount: number): void {
  if (rowCount > MAX_ROWS) {
    throw new HttpError(413, "too_many_rows", `CSV files may contain at most ${MAX_ROWS} rows.`);
  }
}

export interface ImportRepository {
  preview(env: Bindings, tenantId: string, input: ImportPreviewRequest): Promise<ImportPreview>;
  commit(env: Bindings, tenantId: string, input: ImportCommitRequest): Promise<ImportCommitResult>;
}

async function findExistingFingerprints(
  env: Bindings,
  tenantId: string,
  fingerprints: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let offset = 0; offset < fingerprints.length; offset += 80) {
    const chunk = fingerprints.slice(offset, offset + 80);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `SELECT import_fingerprint AS fingerprint FROM transactions WHERE tenant_id = ? AND import_fingerprint IN (${placeholders})`,
    )
      .bind(tenantId, ...chunk)
      .all<{ fingerprint: string }>();
    for (const row of result.results) existing.add(row.fingerprint);
  }
  return existing;
}

function invalidStoredPreview(): never {
  throw new HttpError(500, "invalid_preview", "The saved preview could not be read.");
}

function parseStoredRows(value: string): PreparedImportRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    invalidStoredPreview();
  }
  if (!Array.isArray(parsed)) invalidStoredPreview();

  const rows = parsed.map((candidate) => {
    if (!candidate || typeof candidate !== "object") invalidStoredPreview();
    const row = candidate as Record<string, unknown>;
    const kind = row.kind;
    if (
      !Number.isInteger(row.rowNumber) ||
      (row.rowNumber as number) < 1 ||
      typeof row.date !== "string" ||
      normalizeImportDate(row.date) !== row.date ||
      typeof row.description !== "string" ||
      !row.description ||
      !Number.isSafeInteger(row.amountMinor) ||
      row.amountMinor === 0 ||
      (kind !== "income" && kind !== "expense" && kind !== "transfer") ||
      typeof row.categoryId !== "string" ||
      !row.categoryId ||
      typeof row.categoryName !== "string" ||
      !row.categoryName ||
      typeof row.fingerprint !== "string" ||
      !row.fingerprint
    ) {
      invalidStoredPreview();
    }

    return {
      rowNumber: row.rowNumber as number,
      date: row.date,
      description: row.description,
      amountMinor: row.amountMinor as number,
      kind,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryIsUncategorized: row.categoryIsUncategorized === true,
      fingerprint: row.fingerprint,
    } satisfies PreparedImportRecord;
  });
  if (new Set(rows.map((row) => row.rowNumber)).size !== rows.length) invalidStoredPreview();
  return rows;
}

interface OverrideCategory {
  id: string;
  name: string;
  kind: TransactionKind;
  archived: boolean;
  systemKey: string | null;
}

export function applyCategoryOverridesToRows(
  rows: PreparedImportRecord[],
  overrides: ImportCommitRequest["categoryOverrides"],
  availableCategories: OverrideCategory[],
): PreparedImportRecord[] {
  if (overrides.length === 0) return rows;

  const categoryById = new Map(availableCategories.map((category) => [category.id, category]));
  const rowByNumber = new Map(rows.map((row) => [row.rowNumber, row]));
  const replacements = new Map<number, PreparedImportRecord>();

  for (const override of overrides) {
    const row = rowByNumber.get(override.rowNumber);
    const category = categoryById.get(override.categoryId);
    if (
      !row ||
      !row.categoryIsUncategorized ||
      !category ||
      category.archived ||
      category.systemKey !== null ||
      category.kind !== row.kind
    ) {
      throw new HttpError(
        400,
        "invalid_category_override",
        "One or more category changes are no longer valid. Preview the file again.",
      );
    }
    replacements.set(row.rowNumber, {
      ...row,
      categoryId: category.id,
      categoryName: category.name,
      categoryIsUncategorized: false,
    });
  }

  return rows.map((row) => replacements.get(row.rowNumber) ?? row);
}

async function applyCategoryOverrides(
  env: Bindings,
  tenantId: string,
  rows: PreparedImportRecord[],
  overrides: ImportCommitRequest["categoryOverrides"],
): Promise<PreparedImportRecord[]> {
  if (overrides.length === 0) return rows;

  const db = drizzle(env.DB);
  const availableCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      archived: categories.archived,
      systemKey: categories.systemKey,
    })
    .from(categories)
    .where(eq(categories.tenantId, tenantId));
  return applyCategoryOverridesToRows(rows, overrides, availableCategories);
}

export const importRepository: ImportRepository = {
  async preview(env, tenantId, input) {
    assertImportFileSize(input.csvText);

    let csv;
    try {
      csv = parseCsv(input.csvText, { headerRowNumber: input.headerRowNumber });
    } catch (error) {
      throw new HttpError(
        400,
        "invalid_csv",
        error instanceof Error ? error.message : "The CSV could not be parsed.",
      );
    }
    if (csv.rows.length === 0) throw new HttpError(400, "empty_csv", "The CSV has no data rows.");
    assertImportRowCount(csv.rows.length);

    const db = drizzle(env.DB);
    const storedCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        archived: categories.archived,
        systemKey: categories.systemKey,
      })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.archived, false)));
    const categoryRows = storedCategories.map(({ systemKey, ...category }) => ({
      ...category,
      system: systemKey !== null,
    }));
    const transactionKinds: TransactionKind[] = ["income", "expense", "transfer"];
    if (
      transactionKinds.some(
        (kind) =>
          !storedCategories.some(
            (category) => category.systemKey === `uncategorized:${kind}` && category.kind === kind,
          ),
      )
    ) {
      throw new HttpError(
        500,
        "import_categories_unavailable",
        "Uncategorized categories are not available. Apply the latest database migration.",
      );
    }
    const defaultAccountId = defaultAccountIdForTenant(tenantId);

    let initial;
    try {
      initial = await prepareImportRows(
        csv,
        input.mapping,
        categoryRows,
        new Set(),
        defaultAccountId,
        input.fallbackDate,
      );
    } catch (error) {
      throw new HttpError(
        400,
        "invalid_mapping",
        error instanceof Error ? error.message : "Check the CSV column mapping.",
      );
    }
    const existing = await findExistingFingerprints(
      env,
      tenantId,
      initial.records.map((row) => row.fingerprint),
    );
    const prepared =
      existing.size === 0
        ? initial
        : await prepareImportRows(
            csv,
            input.mapping,
            categoryRows,
            existing,
            defaultAccountId,
            input.fallbackDate,
          );

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + PREVIEW_LIFETIME_MS).toISOString();
    const acceptedCount = prepared.records.length;
    const rejectedCount = csv.rows.length - acceptedCount;
    await db
      .delete(importPreviews)
      .where(
        and(
          eq(importPreviews.tenantId, tenantId),
          lt(importPreviews.expiresAt, new Date().toISOString()),
        ),
      );
    if (acceptedCount > 0) {
      await db.insert(importPreviews).values({
        id: token,
        tenantId,
        originalFilename: input.fileName,
        rowsJson: JSON.stringify(prepared.records),
        rowCount: csv.rows.length,
        acceptedCount,
        rejectedCount,
        expiresAt,
      });
    }

    return {
      token,
      expiresAt,
      fileName: input.fileName,
      rowCount: csv.rows.length,
      acceptedCount,
      rejectedCount,
      duplicateCount: prepared.duplicateCount,
      rows: prepared.rows,
    };
  },

  async commit(env, tenantId, input) {
    const db = drizzle(env.DB);
    const [preview] = await db
      .select()
      .from(importPreviews)
      .where(and(eq(importPreviews.id, input.token), eq(importPreviews.tenantId, tenantId)))
      .limit(1);
    if (!preview) throw new HttpError(404, "preview_not_found", "Import preview not found.");
    if (new Date(preview.expiresAt).valueOf() <= Date.now()) {
      await db
        .delete(importPreviews)
        .where(and(eq(importPreviews.id, input.token), eq(importPreviews.tenantId, tenantId)));
      throw new HttpError(
        410,
        "preview_expired",
        "This import preview has expired. Preview the file again.",
      );
    }

    const storedRows = parseStoredRows(preview.rowsJson);
    if (storedRows.length === 0) {
      throw new HttpError(400, "nothing_to_import", "The preview has no valid rows to import.");
    }
    if (storedRows.length !== preview.acceptedCount) invalidStoredPreview();
    const rows = await applyCategoryOverrides(env, tenantId, storedRows, input.categoryOverrides);
    const overriddenRowNumbers = new Set(
      input.categoryOverrides.map((override) => override.rowNumber),
    );
    const importId = crypto.randomUUID();
    const defaultAccountId = defaultAccountIdForTenant(tenantId);
    const statements = [
      env.DB.prepare(
        "INSERT INTO imports (id, tenant_id, original_filename, row_count, accepted_count, rejected_count) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        importId,
        tenantId,
        preview.originalFilename,
        preview.rowCount,
        preview.acceptedCount,
        preview.rejectedCount,
      ),
      ...rows.map((row) => {
        return env.DB.prepare(
          buildImportTransactionInsertSql(overriddenRowNumbers.has(row.rowNumber)),
        ).bind(
          crypto.randomUUID(),
          tenantId,
          defaultAccountId,
          row.categoryId,
          tenantId,
          row.kind,
          row.date,
          row.description,
          row.amountMinor,
          row.kind,
          row.fingerprint,
        );
      }),
      env.DB.prepare("DELETE FROM import_previews WHERE id = ? AND tenant_id = ?").bind(
        input.token,
        tenantId,
      ),
    ];

    try {
      await env.DB.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLocaleLowerCase("en") : "";
      if (message.includes("unique")) {
        throw new HttpError(
          409,
          "import_conflict",
          "A matching transaction was imported after this preview. Preview the file again.",
        );
      }
      if (message.includes("transactions.category_id") || message.includes("not null constraint")) {
        throw new HttpError(
          409,
          "invalid_category_override",
          "One or more categories changed after preview. Preview the file again.",
        );
      }
      throw error;
    }

    return { importId, importedCount: rows.length, rejectedCount: preview.rejectedCount };
  },
};
