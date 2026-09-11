export interface SafeToSpendForecastInput {
  /** Minimum projected balance over the forecast horizon in integer minor units. */
  minProjectedBalanceMinor: number;
}

export interface SafeToSpendOptions {
  /** Remaining weekly spending envelope in integer minor units. */
  remainingWeeklyEnvelopeMinor: number;
  /** Days left in the current week (inclusive of today, e.g. 1 to 7). */
  daysLeftInWeek: number;
  /**
   * Cashflow forecast projection input.
   * Capped so safe spending never pushes the projected balance below zero
   * or below the safety buffer.
   */
  forecast?: SafeToSpendForecastInput | null;
  /** Optional safety buffer in integer minor units. Defaults to 0. */
  safetyBufferMinor?: number;
}

export interface SafeToSpendResult {
  /** The amount the user can safely spend (in integer minor units). */
  safeToSpendMinor: number;
  /** Days left in the week used for the calculation. */
  daysLeftInWeek: number;
  /** Whether the amount was capped by the forecast safe threshold. */
  isForecastCapped: boolean;
  /** Raw envelope per day before forecast constraint. */
  rawDailyEnvelopeMinor: number;
}

/**
 * Derives the amount the user can safely spend this week:
 * = remaining weekly envelope divided by the days left in the week,
 * capped so it never exceeds what the cashflow forecast says is safe
 * (i.e. it must not push the projected balance below zero / below safety buffer).
 *
 * All amounts are integer minor units (PHP centavos).
 */
export function safeToSpend(options: SafeToSpendOptions): number {
  const {
    remainingWeeklyEnvelopeMinor,
    daysLeftInWeek,
    forecast,
    safetyBufferMinor = 0,
  } = options;

  // Edge case: zero or negative envelope
  if (remainingWeeklyEnvelopeMinor <= 0) {
    return 0;
  }

  // Edge case: zero or negative days left in the week
  if (daysLeftInWeek <= 0) {
    return 0;
  }

  // Raw amount: remaining weekly envelope divided by days left in week
  const rawSafeToSpend = Math.floor(remainingWeeklyEnvelopeMinor / daysLeftInWeek);

  // If cashflow forecast is supplied, cap to what the forecast says is safe
  if (forecast != null) {
    // Max safe spend without pushing projected balance below zero or safety buffer
    const forecastSafeLimit = forecast.minProjectedBalanceMinor - safetyBufferMinor;

    // Edge case: forecast minimum below zero (or below safety buffer) -> cap to zero
    if (forecastSafeLimit <= 0) {
      return 0;
    }

    return Math.min(rawSafeToSpend, forecastSafeLimit);
  }

  return rawSafeToSpend;
}

/**
 * Returns structured safe-to-spend metrics including raw and capped values.
 */
export function calculateSafeToSpend(options: SafeToSpendOptions): SafeToSpendResult {
  const safeAmount = safeToSpend(options);
  const raw =
    options.daysLeftInWeek > 0 && options.remainingWeeklyEnvelopeMinor > 0
      ? Math.floor(options.remainingWeeklyEnvelopeMinor / options.daysLeftInWeek)
      : 0;

  return {
    safeToSpendMinor: safeAmount,
    daysLeftInWeek: Math.max(0, options.daysLeftInWeek),
    isForecastCapped: safeAmount < raw,
    rawDailyEnvelopeMinor: raw,
  };
}

/**
 * Calculates days remaining in the week including today (1-7).
 * Default week starts on Monday (Monday=7 days left, Sunday=1 day left).
 */
export function getDaysLeftInWeek(
  date: Date = new Date(),
  weekStartsOn: "monday" | "sunday" = "monday",
): number {
  const day = date.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  if (weekStartsOn === "monday") {
    return day === 0 ? 1 : 8 - day;
  }
  return 7 - day;
}
