import {
  createImportFingerprint,
  normalizeImportDate,
  normalizeSignedAmount,
  parseAmountToMinor,
  type CategoryRecord,
  type ImportMapping,
  type ImportPreviewRow,
  type ParsedCsv,
  type TransactionKind,
} from "@budget/shared";

export interface PreparedImportRecord {
  rowNumber: number;
  date: string;
  description: string;
  amountMinor: number;
  kind: TransactionKind;
  categoryId: string;
  categoryName: string;
  categoryIsUncategorized: boolean;
  fingerprint: string;
}

export interface PreparedImport {
  rows: ImportPreviewRow[];
  records: PreparedImportRecord[];
  duplicateCount: number;
}

function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function parseKind(value: string, amountMinor: number): TransactionKind | null {
  const normalized = normalizeLookup(value);
  if (!normalized) return amountMinor < 0 ? "expense" : "income";
  if (["income", "money in", "in"].includes(normalized)) return "income";
  if (["expense", "money out", "out"].includes(normalized)) return "expense";
  if (normalized === "transfer") return "transfer";
  return null;
}

export async function prepareImportRows(
  csv: ParsedCsv,
  mapping: ImportMapping,
  categories: CategoryRecord[],
  existingFingerprints: ReadonlySet<string>,
  accountSource: string,
  fallbackDate?: string,
): Promise<PreparedImport> {
  if (Boolean(mapping.date) === Boolean(fallbackDate)) {
    throw new Error("Choose a Date column or enter one date for every row.");
  }

  const usesAmount = Boolean(mapping.amount);
  const usesDebit = Boolean(mapping.debit);
  const usesCredit = Boolean(mapping.credit);
  if (!((usesAmount && !usesDebit && !usesCredit) || (!usesAmount && usesDebit && usesCredit))) {
    throw new Error("Choose one Amount column or both Debit and Credit columns.");
  }

  const mappedHeaders = [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.debit,
    mapping.credit,
    mapping.category,
    mapping.kind,
    mapping.currency,
  ].filter((header): header is string => Boolean(header));
  const normalizedMappedHeaders = mappedHeaders.map((header) =>
    header.trim().toLocaleLowerCase("en"),
  );
  if (new Set(normalizedMappedHeaders).size !== normalizedMappedHeaders.length) {
    throw new Error("Each import field must use a different CSV column.");
  }

  const indexes = {
    date: mapping.date ? csv.headers.indexOf(mapping.date) : -1,
    description: csv.headers.indexOf(mapping.description),
    amount: mapping.amount ? csv.headers.indexOf(mapping.amount) : -1,
    debit: mapping.debit ? csv.headers.indexOf(mapping.debit) : -1,
    credit: mapping.credit ? csv.headers.indexOf(mapping.credit) : -1,
    category: mapping.category ? csv.headers.indexOf(mapping.category) : -1,
    kind: mapping.kind ? csv.headers.indexOf(mapping.kind) : -1,
    currency: mapping.currency ? csv.headers.indexOf(mapping.currency) : -1,
  };
  if (indexes.description === -1) {
    throw new Error("One or more mapped CSV columns no longer exist.");
  }
  if (usesAmount && indexes.amount === -1) {
    throw new Error("The mapped amount column no longer exists.");
  }
  if ((!usesAmount && indexes.debit === -1) || (!usesAmount && indexes.credit === -1)) {
    throw new Error("One or more mapped Debit or Credit columns no longer exist.");
  }
  if (mapping.date && indexes.date === -1) {
    throw new Error("The mapped date column no longer exists.");
  }
  if (mapping.category && indexes.category === -1) {
    throw new Error("The mapped category column no longer exists.");
  }
  if (mapping.kind && indexes.kind === -1) {
    throw new Error("The mapped transaction type column no longer exists.");
  }
  if (mapping.currency && indexes.currency === -1) {
    throw new Error("The mapped currency column no longer exists.");
  }

  const categoryLookups = new Map<TransactionKind, Map<string, CategoryRecord>>();
  const uncategorizedByKind = new Map<TransactionKind, CategoryRecord>();
  for (const category of categories) {
    const lookup = categoryLookups.get(category.kind) ?? new Map<string, CategoryRecord>();
    lookup.set(normalizeLookup(category.id), category);
    lookup.set(normalizeLookup(category.name), category);
    categoryLookups.set(category.kind, lookup);
    if (category.system && normalizeLookup(category.name) === "uncategorized") {
      uncategorizedByKind.set(category.kind, category);
    }
  }

  const rows: ImportPreviewRow[] = [];
  const records: PreparedImportRecord[] = [];
  const seenFingerprints = new Set<string>();
  let duplicateCount = 0;

  for (const row of csv.rows) {
    const errors: string[] = [];
    if (row.values.length !== csv.headers.length) {
      errors.push(`Expected ${csv.headers.length} columns but found ${row.values.length}.`);
    }

    const dateText =
      indexes.date >= 0 ? (row.values[indexes.date]?.trim() ?? "") : (fallbackDate ?? "");
    const date = normalizeImportDate(dateText);
    const description = row.values[indexes.description]?.trim() ?? "";
    const categoryText = indexes.category >= 0 ? (row.values[indexes.category]?.trim() ?? "") : "";
    const kindText = indexes.kind >= 0 ? (row.values[indexes.kind]?.trim() ?? "") : "";
    const currencyText =
      indexes.currency >= 0 ? (row.values[indexes.currency]?.trim() ?? "") : "PHP";

    if (!date) errors.push("Date must be a real YYYY-MM-DD or MM/DD/YYYY date.");
    if (!description) errors.push("Description is required.");
    else if (description.length > 240) errors.push("Description must be 240 characters or fewer.");

    let amountMinor: number | undefined;
    if (usesAmount) {
      const amountText = row.values[indexes.amount]?.trim() ?? "";
      try {
        amountMinor = parseAmountToMinor(amountText);
        if (amountMinor === 0) errors.push("Amount cannot be zero.");
      } catch {
        errors.push("Amount must be a plain number with up to two decimal places.");
      }
    } else {
      const debitText = row.values[indexes.debit]?.trim() ?? "";
      const creditText = row.values[indexes.credit]?.trim() ?? "";
      let debitMinor: number | undefined;
      let creditMinor: number | undefined;
      let amountParseFailed = false;

      if (debitText) {
        try {
          debitMinor = parseAmountToMinor(debitText);
        } catch {
          amountParseFailed = true;
          errors.push("Debit must be a plain number with up to two decimal places.");
        }
      }
      if (creditText) {
        try {
          creditMinor = parseAmountToMinor(creditText);
        } catch {
          amountParseFailed = true;
          errors.push("Credit must be a plain number with up to two decimal places.");
        }
      }

      if (!amountParseFailed) {
        const hasDebit = debitMinor !== undefined && debitMinor !== 0;
        const hasCredit = creditMinor !== undefined && creditMinor !== 0;
        if (hasDebit === hasCredit) {
          errors.push("Enter a nonzero value in either Debit or Credit, but not both.");
        } else {
          amountMinor = hasDebit ? -Math.abs(debitMinor!) : Math.abs(creditMinor!);
        }
      }
    }

    const kind = amountMinor === undefined ? null : parseKind(kindText, amountMinor);
    if (!kind) errors.push("Type must be income, expense, or transfer.");
    if (
      !usesAmount &&
      kindText &&
      kind &&
      kind !== "transfer" &&
      ((kind === "income" && amountMinor! < 0) || (kind === "expense" && amountMinor! > 0))
    ) {
      errors.push("Type must match whether the value is in Debit or Credit.");
    }
    if (currencyText.toUpperCase() !== "PHP") errors.push("Currency must be PHP.");
    const matchedCategory =
      kind && categoryText
        ? categoryLookups.get(kind)?.get(normalizeLookup(categoryText))
        : undefined;
    const category = matchedCategory ?? (kind ? uncategorizedByKind.get(kind) : undefined);
    if (kind && !category) errors.push("The Uncategorized category is unavailable.");
    const categoryIsUncategorized = Boolean(
      category?.system && normalizeLookup(category.name) === "uncategorized",
    );

    const previewBase = {
      rowNumber: row.rowNumber,
      date: date ?? (dateText || undefined),
      description: description || undefined,
      amountMinor,
      kind: kind ?? undefined,
      categoryId: category?.id,
      categoryName: category?.name,
      categoryIsUncategorized,
    };

    if (errors.length > 0 || amountMinor === undefined || !date || !kind || !category) {
      rows.push({ ...previewBase, status: "invalid", errors });
      continue;
    }

    const signedAmount =
      kind === "transfer" ? amountMinor : normalizeSignedAmount(amountMinor, kind);
    const fingerprint = await createImportFingerprint({
      date,
      amountMinor: signedAmount,
      description,
      accountSource,
    });
    const duplicate = seenFingerprints.has(fingerprint) || existingFingerprints.has(fingerprint);
    seenFingerprints.add(fingerprint);
    if (duplicate) {
      duplicateCount += 1;
      rows.push({
        ...previewBase,
        amountMinor: signedAmount,
        status: "duplicate",
        errors: ["This row matches another imported or existing transaction."],
      });
      continue;
    }

    rows.push({ ...previewBase, amountMinor: signedAmount, status: "ready", errors: [] });
    records.push({
      rowNumber: row.rowNumber,
      date,
      description,
      amountMinor: signedAmount,
      kind,
      categoryId: category.id,
      categoryName: category.name,
      categoryIsUncategorized,
      fingerprint,
    });
  }

  return { rows, records, duplicateCount };
}
