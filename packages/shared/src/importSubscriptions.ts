import type { ImportPreviewRow } from "./types";

export interface ImportSubscriptionCandidate {
  description: string;
  normalized: string;
  categoryName: string;
  categoryId?: string;
  occurrenceCount: number;
  occurrenceDates: string[];
  distinctMonths: number;
  typicalAmountMinor: number;
  latestAmountMinor: number;
  lowestAmountMinor: number;
  highestAmountMinor: number;
  priceChangeMinor: number;
  priceChangePercent: number | null;
  cadence: "monthly" | "yearly" | "irregular";
  billingCycle: "monthly" | "yearly";
  nextBillingDate: string;
  confidence: "high" | "medium";
  amountVariationRatio: number;
}

function normalizeDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

function monthDifference(from: string, to: string): number {
  return (
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7))
  );
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftMonths(value: string, months: number): string {
  const date = dateFromIso(`${value.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + months);
  const day = Math.min(
    Number(value.slice(8, 10)),
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(),
  );
  // Preserve original day clamped to month length
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day));
  return formatIsoDate(result);
}

function nextBillingDateFrom(lastDate: string, billingCycle: "monthly" | "yearly"): string {
  return shiftMonths(lastDate, billingCycle === "yearly" ? 12 : 1);
}

function roundPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function detectImportSubscriptionCandidates(
  rows: readonly ImportPreviewRow[],
): ImportSubscriptionCandidate[] {
  const ready = rows.filter(
    (row) =>
      row.status === "ready" &&
      row.kind === "expense" &&
      typeof row.description === "string" &&
      row.description.trim().length > 0 &&
      typeof row.amountMinor === "number" &&
      row.amountMinor !== 0 &&
      typeof row.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.date),
  );

  const groups = new Map<string, ImportPreviewRow[]>();
  for (const row of ready) {
    const key = normalizeDescription(row.description!);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const candidates: ImportSubscriptionCandidate[] = [];

  for (const [normalized, items] of groups.entries()) {
    if (items.length < 2) continue;

    const sorted = [...items].sort((a, b) => a.date!.localeCompare(b.date!));
    const amounts = sorted.map((r) => Math.abs(r.amountMinor!));
    const distinctMonths = new Set(sorted.map((r) => r.date!.slice(0, 7))).size;
    const occurrenceCount = sorted.length;

    // Require at least 2 distinct months OR 3 occurrences in same month window
    if (distinctMonths < 2 && occurrenceCount < 3) continue;

    const typicalAmountMinor = median(amounts);
    const lowestAmountMinor = Math.min(...amounts);
    const highestAmountMinor = Math.max(...amounts);
    const latestAmountMinor = amounts.at(-1)!;
    const previousAmountMinor = amounts.at(-2) ?? latestAmountMinor;
    const priceChangeMinor = latestAmountMinor - previousAmountMinor;
    const priceChangePercent = roundPercent(priceChangeMinor, previousAmountMinor);
    const amountVariationRatio =
      typicalAmountMinor === 0 ? 0 : (highestAmountMinor - lowestAmountMinor) / typicalAmountMinor;

    // Filter wildly varying amounts (>50% variation) - not same subscription
    if (amountVariationRatio > 0.5) continue;

    // Determine cadence / billingCycle
    const monthSteps = sorted
      .slice(1)
      .map((row, idx) => monthDifference(sorted[idx]!.date!, row.date!));

    const monthlySteps = monthSteps.filter((s) => s === 1).length;
    const yearlySteps = monthSteps.filter((s) => s === 12).length;

    let cadence: "monthly" | "yearly" | "irregular" = "irregular";
    let billingCycle: "monthly" | "yearly" = "monthly";

    if (yearlySteps === monthSteps.length && monthSteps.length > 0) {
      cadence = "yearly";
      billingCycle = "yearly";
    } else if (
      monthlySteps >= Math.max(1, monthSteps.length - 1) ||
      (distinctMonths >= 2 && monthlySteps >= 1 && monthlySteps / monthSteps.length >= 0.5)
    ) {
      cadence = "monthly";
      billingCycle = "monthly";
    } else if (distinctMonths >= 3 && monthlySteps >= 2) {
      cadence = "monthly";
      billingCycle = "monthly";
    } else {
      // Fallback: infer from median step
      const medianStep = monthSteps.length ? median(monthSteps) : 1;
      if (medianStep === 12) {
        cadence = "yearly";
        billingCycle = "yearly";
      } else if (medianStep === 1) {
        cadence = "monthly";
        billingCycle = "monthly";
      }
    }

    // Confidence
    let confidence: "high" | "medium" | null = null;
    if (
      distinctMonths >= 3 &&
      occurrenceCount >= 3 &&
      amountVariationRatio <= 0.15 &&
      cadence === "monthly"
    ) {
      confidence = "high";
    } else if (
      distinctMonths >= 3 &&
      occurrenceCount >= 3 &&
      amountVariationRatio <= 0.3
    ) {
      confidence = "high";
    } else if (distinctMonths >= 2 && occurrenceCount >= 2 && amountVariationRatio <= 0.3) {
      confidence = "medium";
    } else if (occurrenceCount >= 3 && amountVariationRatio <= 0.3) {
      confidence = "medium";
    }

    if (!confidence) continue;

    // Most common category
    const categoryCounts = new Map<string, { name: string; id?: string; count: number }>();
    for (const row of sorted) {
      const name = row.categoryName ?? "Uncategorized";
      const keyCat = name.toLocaleLowerCase("en");
      const existing = categoryCounts.get(keyCat);
      if (existing) existing.count += 1;
      else categoryCounts.set(keyCat, { name, id: row.categoryId, count: 1 });
    }
    const topCategory = [...categoryCounts.values()].sort((a, b) => b.count - a.count)[0]!;

    const lastDate = sorted.at(-1)!.date!;
    const nextBillingDate = nextBillingDateFrom(lastDate, billingCycle);

    candidates.push({
      description: sorted[0]!.description!.trim(),
      normalized,
      categoryName: topCategory.name,
      categoryId: topCategory.id,
      occurrenceCount,
      occurrenceDates: sorted.map((r) => r.date!),
      distinctMonths,
      typicalAmountMinor,
      latestAmountMinor,
      lowestAmountMinor,
      highestAmountMinor,
      priceChangeMinor,
      priceChangePercent,
      cadence,
      billingCycle,
      nextBillingDate,
      confidence,
      amountVariationRatio,
    });
  }

  return candidates.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
    return b.typicalAmountMinor - a.typicalAmountMinor;
  });
}
