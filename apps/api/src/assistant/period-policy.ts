import type { AssistantHistoryMessage } from "../db/assistant";

export const PERIOD_CLARIFICATION_RESPONSE =
  "Which month or date range should I use? For example, August 2026 or July 1 to August 2, 2026.";

const AGGREGATE_TERM_PATTERN =
  /\b(?:income|earnings?|expenses?|spending|spent|spend|net|savings?|cash\s*flow|remaining|left|trends?|averages?)\b/i;
const AGGREGATE_REQUEST_PATTERN =
  /\b(?:how much|how about|what(?:'s| is| was| were| are| about)|total|sum|average|show|give|tell|compare|trend|breakdown)\b/i;
const MONTH_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const RELATIVE_PERIOD_PATTERN =
  /\b(?:(?:this|last|previous|current|next)\s+(?:day|week|month|quarter|year)|today|yesterday|month[ -]to[ -]date|year[ -]to[ -]date|mtd|ytd|all[ -]time|all\s+(?:recorded\s+)?history|since\s+(?:i\s+)?started|past\s+\d+\s+(?:days?|weeks?|months?|years?))\b/i;
const ISO_DATE_PATTERN = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/;
const NUMERIC_DATE_PATTERN = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/;
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;

export function hasExplicitPeriod(value: string): boolean {
  return (
    MONTH_PATTERN.test(value) ||
    RELATIVE_PERIOD_PATTERN.test(value) ||
    ISO_DATE_PATTERN.test(value) ||
    NUMERIC_DATE_PATTERN.test(value) ||
    YEAR_PATTERN.test(value)
  );
}

export function isPeriodBoundAggregateRequest(message: string): boolean {
  return AGGREGATE_TERM_PATTERN.test(message) && AGGREGATE_REQUEST_PATTERN.test(message);
}

function hasRecentPeriodContext(history: AssistantHistoryMessage[]): boolean {
  let lastAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === "assistant") {
      lastAssistantIndex = index;
      break;
    }
  }
  if (lastAssistantIndex < 0 || !hasExplicitPeriod(history[lastAssistantIndex]!.content))
    return false;

  for (let index = lastAssistantIndex - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role === "user") return hasExplicitPeriod(item.content);
  }
  return false;
}

export function needsPeriodClarification(
  history: AssistantHistoryMessage[],
  message: string,
): boolean {
  if (!isPeriodBoundAggregateRequest(message) || hasExplicitPeriod(message)) return false;
  return !hasRecentPeriodContext(history);
}
