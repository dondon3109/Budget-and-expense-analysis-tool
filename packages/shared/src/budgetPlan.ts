// Budget plans: one month, the every-month defaults, or one occasion.

import type { Currency } from "./types";

export interface BudgetRecord {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  month: string;
  limitMinor: number;
}

export interface BudgetPlanItem {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  usedPercent: number;
  /** Where the limit comes from; a month shows its own limit over the every-month default. */
  source: "month" | "every-month" | "occasion" | "none";
}

/** One budget plan: a month, the every-month defaults, or a single occasion. */
export interface BudgetPlan {
  scope: "month" | "every-month" | "occasion";
  /** Set for a month plan. */
  month: string | null;
  /** Set for an occasion plan: the calendar event it budgets. */
  eventId: string | null;
  title: string | null;
  /** The occasion's date; spending on this day counts against it. */
  date: string | null;
  currency: Currency;
  totalLimitMinor: number;
  totalSpentMinor: number;
  remainingMinor: number;
  usedPercent: number;
  items: BudgetPlanItem[];
}

/** An occasion in a month, as the calendar shows it. */
export interface BudgetOccasionSummary {
  eventId: string;
  title: string;
  date: string;
  totalLimitMinor: number;
  totalSpentMinor: number;
}
