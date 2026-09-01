// ── Interfaces ──────────────────────────────────────────────────────────────

export interface ForecastRecurringIncome {
  id?: string;
  name: string;
  amountMinor: number;
  cadence: "monthly" | "biweekly" | "weekly" | "yearly";
  nextDepositDate: string; // YYYY-MM-DD
}

export interface ForecastCashflowEvent {
  date: string; // YYYY-MM-DD
  type: "bill" | "income";
  id: string;
  name: string;
  amountMinor: number;
  categoryName?: string;
}

export interface DailyCashflowPoint {
  date: string; // YYYY-MM-DD
  dayIndex: number;
  projectedBalanceMinor: number;
  netChangeMinor: number;
  events: ForecastCashflowEvent[];
  isDip: boolean;
  isDeficit: boolean;
}

export interface UpcomingBillRisk {
  billId: string;
  billName: string;
  dueDate: string;
  amountMinor: number;
  daysUntilDue: number;
  projectedBalanceAfterMinor: number;
  deficitMinor: number;
  riskLevel: "safe" | "low_buffer" | "critical_deficit";
}

export interface CashflowForecastOptions {
  startingBalanceMinor: number;
  subscriptions: readonly {
    id?: string;
    name: string;
    amountMinor: number;
    billingCycle: "monthly" | "yearly";
    nextBillingDate: string;
    status?: string;
    categoryName?: string;
  }[];
  recurringIncomes?: readonly ForecastRecurringIncome[];
  horizonDays?: 30 | 60 | 90;
  safetyBufferMinor?: number;
  startDate?: string;
}

export interface CashflowForecastResult {
  horizonDays: number;
  startDate: string;
  endDate: string;
  startingBalanceMinor: number;
  endingBalanceMinor: number;
  minProjectedBalanceMinor: number;
  minBalanceDate: string;
  totalBillsMinor: number;
  totalIncomeMinor: number;
  netChangeMinor: number;
  safetyBufferMinor: number;
  hasDeficit: boolean;
  hasBufferDip: boolean;
  dipDaysCount: number;
  dailyTimeline: DailyCashflowPoint[];
  upcomingBillRisks: UpcomingBillRisk[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD (UTC). */
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string into a UTC Date. */
function parseDate(s: string): Date {
  const parts = s.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Advance a date by N calendar months (clamping day to month length). */
function addMonths(d: Date, n: number): Date {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  // Create first of the target month, then clamp the day.
  const target = new Date(Date.UTC(year, month, 1));
  const maxDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, maxDay));
  return target;
}

/** Advance a date by N days. */
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/** Today in YYYY-MM-DD (UTC). */
function todayUTC(): string {
  return fmtDate(new Date());
}

// ── Core ────────────────────────────────────────────────────────────────────

/**
 * Build all bill occurrences for a single subscription within [start, end].
 * Returns events sorted by date.
 */
function billOccurrences(
  sub: CashflowForecastOptions["subscriptions"][number],
  start: Date,
  end: Date,
): ForecastCashflowEvent[] {
  // Skip canceled / paused subscriptions.
  const s = sub.status?.toLowerCase();
  if (s === "canceled" || s === "paused") return [];
  if (!sub.nextBillingDate) return [];

  const events: ForecastCashflowEvent[] = [];
  let cursor = parseDate(sub.nextBillingDate);

  // Walk backward first in case nextBillingDate is after start but there are
  // earlier occurrences.  Not required by spec – nextBillingDate is treated as
  // the anchor; we only walk forward from it.

  // Advance forward until we pass end.
  while (cursor <= end) {
    if (cursor >= start) {
      events.push({
        date: fmtDate(cursor),
        type: "bill",
        id: sub.id ?? sub.name,
        name: sub.name,
        amountMinor: sub.amountMinor,
        categoryName: sub.categoryName,
      });
    }
    cursor =
      sub.billingCycle === "yearly"
        ? addMonths(cursor, 12)
        : addMonths(cursor, 1);
  }
  return events;
}

/**
 * Build all income occurrences for a recurring income within [start, end].
 */
function incomeOccurrences(
  inc: ForecastRecurringIncome,
  start: Date,
  end: Date,
): ForecastCashflowEvent[] {
  if (!inc.nextDepositDate) return [];
  const events: ForecastCashflowEvent[] = [];
  let cursor = parseDate(inc.nextDepositDate);

  while (cursor <= end) {
    if (cursor >= start) {
      events.push({
        date: fmtDate(cursor),
        type: "income",
        id: inc.id ?? inc.name,
        name: inc.name,
        amountMinor: inc.amountMinor,
      });
    }
    switch (inc.cadence) {
      case "weekly":
        cursor = addDays(cursor, 7);
        break;
      case "biweekly":
        cursor = addDays(cursor, 14);
        break;
      case "monthly":
        cursor = addMonths(cursor, 1);
        break;
      case "yearly":
        cursor = addMonths(cursor, 12);
        break;
    }
  }
  return events;
}

export function projectCashflow(
  options: CashflowForecastOptions,
): CashflowForecastResult {
  const horizonDays = options.horizonDays ?? 30;
  const safetyBufferMinor = options.safetyBufferMinor ?? 0;
  const startDateStr = options.startDate ?? todayUTC();
  const startDate = parseDate(startDateStr);
  const endDate = addDays(startDate, horizonDays - 1);
  const endDateStr = fmtDate(endDate);

  // ── Gather all events ───────────────────────────────────────────────────

  const allEvents: ForecastCashflowEvent[] = [];

  for (const sub of options.subscriptions) {
    allEvents.push(...billOccurrences(sub, startDate, endDate));
  }
  if (options.recurringIncomes) {
    for (const inc of options.recurringIncomes) {
      allEvents.push(...incomeOccurrences(inc, startDate, endDate));
    }
  }

  // Index events by date string for O(1) per-day lookup.
  const eventsByDate = new Map<string, ForecastCashflowEvent[]>();
  for (const ev of allEvents) {
    let arr = eventsByDate.get(ev.date);
    if (!arr) {
      arr = [];
      eventsByDate.set(ev.date, arr);
    }
    arr.push(ev);
  }

  // ── Day-by-day projection ───────────────────────────────────────────────

  const dailyTimeline: DailyCashflowPoint[] = [];
  let balance = options.startingBalanceMinor;
  let totalBillsMinor = 0;
  let totalIncomeMinor = 0;
  let minBalance = balance;
  let minBalanceDate = startDateStr;
  let hasDeficit = false;
  let hasBufferDip = false;
  let dipDaysCount = 0;

  // Bill risk tracking: collect per-bill-event balance after deduction.
  const billRiskEntries: {
    event: ForecastCashflowEvent;
    dayIndex: number;
    balanceAfter: number;
  }[] = [];

  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(startDate, i);
    const dateStr = fmtDate(day);
    const dayEvents = eventsByDate.get(dateStr) ?? [];

    // Sort: income first, then bills, so income is applied before deductions.
    dayEvents.sort((a, b) => {
      if (a.type === "income" && b.type === "bill") return -1;
      if (a.type === "bill" && b.type === "income") return 1;
      return 0;
    });

    let netChange = 0;
    for (const ev of dayEvents) {
      if (ev.type === "income") {
        balance += ev.amountMinor;
        totalIncomeMinor += ev.amountMinor;
        netChange += ev.amountMinor;
      } else {
        balance -= ev.amountMinor;
        totalBillsMinor += ev.amountMinor;
        netChange -= ev.amountMinor;
        billRiskEntries.push({ event: ev, dayIndex: i, balanceAfter: balance });
      }
    }

    const isDip = balance < safetyBufferMinor;
    const isDeficit = balance < 0;

    if (isDip) {
      hasBufferDip = true;
      dipDaysCount++;
    }
    if (isDeficit) hasDeficit = true;

    if (balance < minBalance) {
      minBalance = balance;
      minBalanceDate = dateStr;
    }

    dailyTimeline.push({
      date: dateStr,
      dayIndex: i,
      projectedBalanceMinor: balance,
      netChangeMinor: netChange,
      events: dayEvents,
      isDip,
      isDeficit,
    });
  }

  // ── Bill risks ──────────────────────────────────────────────────────────

  const upcomingBillRisks: UpcomingBillRisk[] = billRiskEntries.map((entry) => {
    const { event, dayIndex, balanceAfter } = entry;
    let riskLevel: UpcomingBillRisk["riskLevel"];
    let deficitMinor: number;

    if (balanceAfter < 0) {
      riskLevel = "critical_deficit";
      deficitMinor = Math.abs(balanceAfter) + safetyBufferMinor;
    } else if (balanceAfter < safetyBufferMinor) {
      riskLevel = "low_buffer";
      deficitMinor = safetyBufferMinor - balanceAfter;
    } else {
      riskLevel = "safe";
      deficitMinor = 0;
    }

    return {
      billId: event.id,
      billName: event.name,
      dueDate: event.date,
      amountMinor: event.amountMinor,
      daysUntilDue: dayIndex,
      projectedBalanceAfterMinor: balanceAfter,
      deficitMinor,
      riskLevel,
    };
  });

  return {
    horizonDays,
    startDate: startDateStr,
    endDate: endDateStr,
    startingBalanceMinor: options.startingBalanceMinor,
    endingBalanceMinor: balance,
    minProjectedBalanceMinor: minBalance,
    minBalanceDate,
    totalBillsMinor,
    totalIncomeMinor,
    netChangeMinor: totalIncomeMinor - totalBillsMinor,
    safetyBufferMinor,
    hasDeficit,
    hasBufferDip,
    dipDaysCount,
    dailyTimeline,
    upcomingBillRisks,
  };
}
