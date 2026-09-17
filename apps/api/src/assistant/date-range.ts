import type { AssistantDateRange } from "@zoption/shared";

import type { AssistantHistoryMessage } from "../db/assistant";
import { tagalogWordPattern } from "./language";
import { isPeriodBoundAggregateRequest } from "./period-policy";

export interface TransactionDateBounds {
  from: string;
  to: string;
  transactionCount: number;
}

export interface PeriodResolution {
  period?: AssistantDateRange;
  clarification?: string;
  deterministicResponse?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  enero: 1,
  feb: 2,
  february: 2,
  pebrero: 2,
  mar: 3,
  march: 3,
  marso: 3,
  apr: 4,
  april: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  june: 6,
  hunyo: 6,
  jul: 7,
  july: 7,
  hulyo: 7,
  aug: 8,
  agosto: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  setyembre: 9,
  setiembre: 9,
  oct: 10,
  october: 10,
  oktubre: 10,
  nov: 11,
  november: 11,
  nobyembre: 11,
  nobiembre: 11,
  dec: 12,
  december: 12,
  disyembre: 12,
  disiembre: 12,
};

const MONTH_NAME =
  "jan(?:uary)?|enero|feb(?:ruary)?|pebrero|mar(?:ch)?|marso|apr(?:il)?|abril|mayo?|jun(?:e)?|hunyo|jul(?:y)?|hulyo|aug(?:ust)?|agosto|sep(?:t(?:ember)?)?|set(?:y|i)embre|oct(?:ober)?|oktubre|nov(?:ember)?|nob(?:y|i)embre|dec(?:ember)?|dis(?:y|i)embre";
const DEFAULT_CLARIFICATION =
  "Which month or date range should I use? For example, August 2026 or July 1 to August 2, 2026.";
const DEFAULT_CLARIFICATION_TAGALOG =
  "Aling buwan o petsa ang nais mong gamitin? Halimbawa, Agosto 2026 o Hulyo 1 hanggang Agosto 2, 2026.";

const TAGALOG_MESSAGE_PATTERN = tagalogWordPattern();

export function isTagalogMessage(message: string): boolean {
  return TAGALOG_MESSAGE_PATTERN.test(message);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: string, amount: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIsoDate(date);
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return formatIsoDate(date);
}

function shiftMonthStart(value: string, amount: number): string {
  const date = dateFromIso(`${value.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatIsoDate(date);
}

function validDate(year: number, month: number, day: number): string | null {
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = dateFromIso(candidate);
  return Number.isNaN(date.valueOf()) || formatIsoDate(date) !== candidate ? null : candidate;
}

function label(from: string, to: string): string {
  return from === to ? from : `${from} to ${to}`;
}

function explicitIsoRange(message: string): AssistantDateRange | undefined {
  const matches = [...message.matchAll(/\b((?:19|20)\d{2}-\d{2}-\d{2})\b/g)].map(
    (match) => match[1]!,
  );
  if (matches.length === 0) return undefined;
  const from = matches[0]!;
  const to = matches[1] ?? from;
  if (!validDate(Number(from.slice(0, 4)), Number(from.slice(5, 7)), Number(from.slice(8, 10)))) {
    return undefined;
  }
  if (!validDate(Number(to.slice(0, 4)), Number(to.slice(5, 7)), Number(to.slice(8, 10)))) {
    return undefined;
  }
  return from <= to ? { from, to, label: label(from, to) } : undefined;
}

function namedDayRange(message: string): AssistantDateRange | undefined {
  const pattern = new RegExp(
    `(?:(?:from|mula)\\s+)?(${MONTH_NAME})\\s+(\\d{1,2})(?:,?\\s+((?:19|20)\\d{2}))?\\s+(?:to|through|hanggang|-)\\s+(${MONTH_NAME})\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})`,
    "i",
  );
  const match = pattern.exec(message);
  if (!match) return undefined;
  const fromMonth = MONTHS[match[1]!.toLocaleLowerCase("en")]!;
  const toMonth = MONTHS[match[4]!.toLocaleLowerCase("en")]!;
  const toYear = Number(match[6]);
  const fromYear = match[3] ? Number(match[3]) : fromMonth > toMonth ? toYear - 1 : toYear;
  const from = validDate(fromYear, fromMonth, Number(match[2]));
  const to = validDate(toYear, toMonth, Number(match[5]));
  return from && to && from <= to ? { from, to, label: label(from, to) } : undefined;
}

function namedMonthRange(message: string): PeriodResolution | undefined {
  const pattern = new RegExp(
    `(?:(?:from|mula)\\s+)?(${MONTH_NAME})(?:\\s+((?:19|20)\\d{2}))?\\s*(?:to|through|hanggang|-)\\s*(${MONTH_NAME})(?:\\s+((?:19|20)\\d{2}))?\\b`,
    "i",
  );
  const match = pattern.exec(message);
  if (!match) return undefined;
  if (!match[2] && !match[4]) {
    const isTagalog = isTagalogMessage(message);
    return {
      clarification: isTagalog
        ? "Aling taon ang dapat kong gamitin para sa saklaw ng buwan? Halimbawa, Hulyo hanggang Agosto 2026."
        : "Which year should I use for that month range? For example, July to August 2026.",
    };
  }

  const fromMonth = MONTHS[match[1]!.toLocaleLowerCase("en")]!;
  const toMonth = MONTHS[match[3]!.toLocaleLowerCase("en")]!;
  const fromYear = match[2] ? Number(match[2]) : Number(match[4]) - (fromMonth > toMonth ? 1 : 0);
  const toYear = match[4] ? Number(match[4]) : Number(match[2]) + (toMonth < fromMonth ? 1 : 0);
  const from = monthStart(fromYear, fromMonth);
  const to = monthEnd(toYear, toMonth);

  if (from > to) {
    const isTagalog = isTagalogMessage(message);
    return {
      clarification: isTagalog
        ? "Ang simula ng saklaw ng buwan ay dapat bago ang katapusan."
        : "The start of the month range must be before the end.",
    };
  }
  return { period: { from, to, label: label(from, to) } };
}

function namedMonth(message: string): PeriodResolution | undefined {
  const match = new RegExp(`\\b(${MONTH_NAME})(?:\\s+((?:19|20)\\d{2}))?\\b`, "i").exec(message);
  if (!match) return undefined;
  if (!match[2]) {
    const isTagalog = isTagalogMessage(message);
    return {
      clarification: isTagalog
        ? "Aling taon ang dapat kong gamitin para sa buwang iyon? Halimbawa, Agosto 2026."
        : "Which year should I use for that month? For example, August 2026.",
    };
  }
  const month = MONTHS[match[1]!.toLocaleLowerCase("en")]!;
  const year = Number(match[2]);
  const from = monthStart(year, month);
  const to = monthEnd(year, month);
  return { period: { from, to, label: `${match[1]} ${year}` } };
}

function inheritedPeriod(
  history: readonly AssistantHistoryMessage[],
): AssistantDateRange | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role === "assistant" && item.metadata?.resolvedPeriod) {
      return item.metadata.resolvedPeriod;
    }
  }
  return undefined;
}

function relativePeriod(
  message: string,
  currentDate: string,
  bounds: TransactionDateBounds | null,
): PeriodResolution | undefined {
  const year = Number(currentDate.slice(0, 4));
  const month = Number(currentDate.slice(5, 7));
  if (/\b(?:today|ngayon|ngayong araw)\b/i.test(message)) {
    return { period: { from: currentDate, to: currentDate, label: "today" } };
  }
  if (/\b(?:yesterday|kahapon)\b/i.test(message)) {
    const day = shiftDays(currentDate, -1);
    return { period: { from: day, to: day, label: "yesterday" } };
  }
  if (
    /\b(?:this month|current month|month[ -]to[ -]date|mtd|ngayong buwan|kasalukuyang buwan|sa buwang ito)\b/i.test(
      message,
    )
  ) {
    return { period: { from: monthStart(year, month), to: currentDate, label: "this month" } };
  }
  if (/\b(?:(?:last|previous) month|(?:nakaraang|noong nakaraang|huling) buwan)\b/i.test(message)) {
    const from = shiftMonthStart(currentDate, -1);
    return {
      period: {
        from,
        to: monthEnd(Number(from.slice(0, 4)), Number(from.slice(5, 7))),
        label: "last month",
      },
    };
  }
  if (
    /\b(?:this year|current year|year[ -]to[ -]date|ytd|ngayong taon|kasalukuyang taon|sa taong ito)\b/i.test(
      message,
    )
  ) {
    return { period: { from: `${year}-01-01`, to: currentDate, label: "this year" } };
  }
  if (/\b(?:(?:last|previous) year|(?:nakaraang|noong nakaraang|huling) taon)\b/i.test(message)) {
    return {
      period: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: "last year" },
    };
  }
  if (/\b(?:this quarter|ngayong sangkapat)\b/i.test(message)) {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      period: {
        from: monthStart(year, quarterStartMonth),
        to: currentDate,
        label: "this quarter",
      },
    };
  }
  if (/\b(?:(?:last|previous) quarter|(?:nakaraang|noong nakaraang) sangkapat)\b/i.test(message)) {
    const currentQuarterStart = monthStart(year, Math.floor((month - 1) / 3) * 3 + 1);
    const from = shiftMonthStart(currentQuarterStart, -3);
    const endStart = shiftMonthStart(currentQuarterStart, -1);
    return {
      period: {
        from,
        to: monthEnd(Number(endStart.slice(0, 4)), Number(endStart.slice(5, 7))),
        label: "last quarter",
      },
    };
  }

  const days =
    /\b(?:past|last)\s+(\d{1,3})\s+days?\b/i.exec(message) ??
    /\b(?:nakalipas|nakaraang|huling)(?:\s+na)?\s+(\d{1,3})\s+araw\b/i.exec(message);
  if (days) {
    const count = Number(days[1]);
    const isTagalog = isTagalogMessage(message);
    if (count < 1 || count > 730) {
      return {
        clarification: isTagalog
          ? "Pumili ng panahon sa pagitan ng 1 at 730 araw."
          : "Choose a period between 1 and 730 days.",
      };
    }
    return {
      period: {
        from: shiftDays(currentDate, -(count - 1)),
        to: currentDate,
        label: `past ${count} days`,
      },
    };
  }

  const months =
    /\b(?:past|last)\s+(\d{1,2})\s+months?\b/i.exec(message) ??
    /\b(?:nakalipas|nakaraang|huling)(?:\s+na)?\s+(\d{1,2})\s+buwan\b/i.exec(message);
  if (months) {
    const count = Number(months[1]);
    const isTagalog = isTagalogMessage(message);
    if (count < 1 || count > 24) {
      return {
        clarification: isTagalog
          ? "Pumili ng panahon sa pagitan ng 1 at 24 buwan."
          : "Choose a period between 1 and 24 months.",
      };
    }
    return {
      period: {
        from: shiftMonthStart(monthStart(year, month), -(count - 1)),
        to: currentDate,
        label: `past ${count} months`,
      },
    };
  }

  if (
    /\b(?:all[ -]time|all\s+(?:recorded\s+)?history|since\s+(?:i\s+)?started|lahat ng (?:transaksyon|gastos|tala)|simula nang magsimula|buong kasaysayan|mula simula)\b/i.test(
      message,
    )
  ) {
    if (!bounds || bounds.transactionCount === 0) {
      const isTagalog = isTagalogMessage(message);
      return {
        deterministicResponse: isTagalog
          ? "Wala pa akong naitalang mga transaksyon na susuriin."
          : "I don't have any recorded transactions to analyze yet.",
      };
    }
    return {
      period: { from: bounds.from, to: bounds.to, label: "all recorded history" },
    };
  }
  return undefined;
}

export function resolveAssistantPeriod(
  history: readonly AssistantHistoryMessage[],
  message: string,
  currentDate: string,
  bounds: TransactionDateBounds | null,
  requiresPeriodOverride = false,
): PeriodResolution {
  const requiresPeriod = requiresPeriodOverride || isPeriodBoundAggregateRequest(message);
  const iso = explicitIsoRange(message);
  if (iso) return { period: iso };
  const namedRange = namedDayRange(message);
  if (namedRange) return { period: namedRange };
  const relative = relativePeriod(message, currentDate, bounds);
  if (relative) return relative;
  const monthRange = requiresPeriod ? namedMonthRange(message) : undefined;
  if (monthRange) return monthRange;
  const month = requiresPeriod ? namedMonth(message) : undefined;
  if (month) return month;

  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(message)) {
    const isTagalog = isTagalogMessage(message);
    return {
      clarification: isTagalog
        ? "Mangyaring gumamit ng malinaw na petsa tulad ng 2026-08-02."
        : "Please use an unambiguous date such as 2026-08-02.",
    };
  }

  const yearMatch = /\b((?:19|20)\d{2})\b/.exec(message);
  if (yearMatch) {
    const requestedYear = Number(yearMatch[1]);
    return {
      period: {
        from: `${requestedYear}-01-01`,
        to:
          requestedYear === Number(currentDate.slice(0, 4))
            ? currentDate
            : `${requestedYear}-12-31`,
        label: String(requestedYear),
      },
    };
  }

  if (!requiresPeriod) return {};
  const inherited = inheritedPeriod(history);
  const isTagalog = isTagalogMessage(message);
  return inherited
    ? { period: inherited }
    : { clarification: isTagalog ? DEFAULT_CLARIFICATION_TAGALOG : DEFAULT_CLARIFICATION };
}
