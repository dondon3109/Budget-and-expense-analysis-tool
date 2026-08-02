import type { AssistantDataQualitySignal, AssistantDataQualityStatus } from "@zoption/shared";

export interface AssistantAnalysisTransaction {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  kind: "income" | "expense" | "transfer";
  categoryName: string;
  accountName: string;
  sourceKind: "manual" | "import";
  importId: string | null;
}

export interface DataQualityAssessment {
  status: AssistantDataQualityStatus;
  signals: AssistantDataQualitySignal[];
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (new Date(`${to}T00:00:00Z`).valueOf() - new Date(`${from}T00:00:00Z`).valueOf()) / 86_400_000,
  );
}

export function assessTransactionDataQuality(
  transactions: readonly AssistantAnalysisTransaction[],
  period: { from: string; to: string },
): DataQualityAssessment {
  if (transactions.length === 0) {
    return {
      status: "insufficient",
      signals: [
        {
          code: "no_transactions",
          message: "No recorded transactions were found in this period.",
          count: 0,
        },
      ],
    };
  }

  const signals: AssistantDataQualitySignal[] = [];
  if (transactions.length < 5) {
    signals.push({
      code: "thin_history",
      message: "Only a small number of transactions were available for this period.",
      count: transactions.length,
    });
  }

  const uncategorized = transactions.filter((item) =>
    /^(?:uncategorized|other expense|other income)$/i.test(item.categoryName.trim()),
  ).length;
  if (uncategorized > 0) {
    signals.push({
      code: "uncategorized_transactions",
      message: "Some transactions use a broad or uncategorized category.",
      count: uncategorized,
    });
  }

  const unassigned = transactions.filter((item) => item.accountName === "Unassigned").length;
  if (unassigned > 0) {
    signals.push({
      code: "unassigned_accounts",
      message: "Some transactions are not assigned to an active account.",
      count: unassigned,
    });
  }

  const duplicates = new Map<string, number>();
  for (const item of transactions) {
    const key = [
      item.date,
      normalize(item.description),
      item.amountMinor,
      normalize(item.categoryName),
      normalize(item.accountName),
    ].join("|");
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }
  const duplicateCount = [...duplicates.values()].reduce(
    (count, occurrences) => count + Math.max(0, occurrences - 1),
    0,
  );
  if (duplicateCount > 0) {
    signals.push({
      code: "possible_duplicates",
      message:
        "Some transactions have identical dates, descriptions, amounts, categories, and accounts.",
      count: duplicateCount,
    });
  }

  const legacyImports = transactions.filter(
    (item) => item.sourceKind === "import" && !item.importId,
  ).length;
  if (legacyImports > 0) {
    signals.push({
      code: "legacy_import_provenance",
      message: "Some imported transactions predate detailed file and row provenance.",
      count: legacyImports,
    });
  }

  const merchantCategories = new Map<string, Map<string, number>>();
  for (const item of transactions.filter((transaction) => transaction.kind !== "transfer")) {
    const merchant = normalize(item.description);
    const categories = merchantCategories.get(merchant) ?? new Map<string, number>();
    categories.set(item.categoryName, (categories.get(item.categoryName) ?? 0) + 1);
    merchantCategories.set(merchant, categories);
  }
  let inconsistentCount = 0;
  for (const categories of merchantCategories.values()) {
    const counts = [...categories.values()];
    const total = counts.reduce((sum, count) => sum + count, 0);
    const dominant = Math.max(...counts);
    if (total >= 4 && categories.size > 1 && dominant / total >= 0.75) {
      inconsistentCount += total - dominant;
    }
  }
  if (inconsistentCount > 0) {
    signals.push({
      code: "possible_category_inconsistency",
      message: "Some repeated descriptions differ from their usual category.",
      count: inconsistentCount,
    });
  }

  const sortedDates = [...new Set(transactions.map((item) => item.date))].sort();
  const possibleGaps = sortedDates
    .slice(1)
    .filter((date, index) => daysBetween(sortedDates[index]!, date) >= 14).length;
  if (daysBetween(period.from, period.to) >= 28 && possibleGaps > 0) {
    signals.push({
      code: "possible_coverage_gaps",
      message:
        "There are one or more 14-day spans with no recorded transactions; this may be normal or may indicate incomplete coverage.",
      count: possibleGaps,
    });
  }

  return {
    status: signals.length > 0 ? "limited" : "reliable",
    signals,
  };
}
