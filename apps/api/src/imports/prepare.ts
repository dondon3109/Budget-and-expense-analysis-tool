import {
  createImportFingerprint,
  isoDateSchema,
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
): Promise<PreparedImport> {
  const mappedHeaders = [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.category,
    ...(mapping.kind ? [mapping.kind] : []),
    ...(mapping.currency ? [mapping.currency] : []),
  ];
  if (new Set(mappedHeaders).size !== mappedHeaders.length) {
    throw new Error("Each import field must use a different CSV column.");
  }

  const indexes = {
    date: csv.headers.indexOf(mapping.date),
    description: csv.headers.indexOf(mapping.description),
    amount: csv.headers.indexOf(mapping.amount),
    category: csv.headers.indexOf(mapping.category),
    kind: mapping.kind ? csv.headers.indexOf(mapping.kind) : -1,
    currency: mapping.currency ? csv.headers.indexOf(mapping.currency) : -1,
  };
  if ([indexes.date, indexes.description, indexes.amount, indexes.category].includes(-1)) {
    throw new Error("One or more mapped CSV columns no longer exist.");
  }
  if (mapping.kind && indexes.kind === -1) {
    throw new Error("The mapped transaction type column no longer exists.");
  }
  if (mapping.currency && indexes.currency === -1) {
    throw new Error("The mapped currency column no longer exists.");
  }

  const categoryLookup = new Map<string, CategoryRecord>();
  for (const category of categories) {
    categoryLookup.set(normalizeLookup(category.id), category);
    categoryLookup.set(normalizeLookup(category.name), category);
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

    const date = row.values[indexes.date]?.trim() ?? "";
    const description = row.values[indexes.description]?.trim() ?? "";
    const amountText = row.values[indexes.amount]?.trim() ?? "";
    const categoryText = row.values[indexes.category]?.trim() ?? "";
    const kindText = indexes.kind >= 0 ? (row.values[indexes.kind]?.trim() ?? "") : "";
    const currencyText =
      indexes.currency >= 0 ? (row.values[indexes.currency]?.trim() ?? "") : "PHP";

    if (!isoDateSchema.safeParse(date).success) errors.push("Date must be a real YYYY-MM-DD date.");
    if (!description) errors.push("Description is required.");
    else if (description.length > 240) errors.push("Description must be 240 characters or fewer.");

    let amountMinor: number | undefined;
    try {
      amountMinor = parseAmountToMinor(amountText);
      if (amountMinor === 0) errors.push("Amount cannot be zero.");
    } catch {
      errors.push("Amount must be a plain number with up to two decimal places.");
    }

    const kind = amountMinor === undefined ? null : parseKind(kindText, amountMinor);
    if (!kind) errors.push("Type must be income, expense, or transfer.");
    if (currencyText.toUpperCase() !== "PHP") errors.push("Currency must be PHP.");
    const category = categoryLookup.get(normalizeLookup(categoryText));
    if (!category) errors.push("Category does not match an active category.");
    else if (kind && category.kind !== kind)
      errors.push("Category type does not match the transaction type.");

    const previewBase = {
      rowNumber: row.rowNumber,
      date: date || undefined,
      description: description || undefined,
      amountMinor,
      kind: kind ?? undefined,
      categoryName: category?.name,
    };

    if (errors.length > 0 || amountMinor === undefined || !kind || !category) {
      rows.push({ ...previewBase, status: "invalid", errors });
      continue;
    }

    const signedAmount =
      kind === "transfer" ? amountMinor : normalizeSignedAmount(amountMinor, kind);
    const fingerprint = await createImportFingerprint({
      date,
      amountMinor: signedAmount,
      description,
      accountSource: "account-everyday",
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
      fingerprint,
    });
  }

  return { rows, records, duplicateCount };
}
