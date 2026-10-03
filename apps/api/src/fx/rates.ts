import { isCurrency, type Currency } from "@zoption/shared";

import type { Bindings } from "../types";

/**
 * Daily exchange rates for every supported currency, quoted as units per US dollar, fetched
 * once per day by the maintenance cron and stored per date. Any pair converts through USD, so
 * the cashflow trend can read every transaction in the workspace currency.
 */

export const FX_RATE_SOURCE = "open.er-api.com";

/**
 * Approximate units per USD (2026). Two jobs: the fallback when the provider has never answered
 * for a currency, and the anchor of the plausibility band below. Keep within a few percent;
 * the band tolerates large moves, so these need updating only after a redenomination or years
 * of high inflation.
 */
export const REFERENCE_UNITS_PER_USD: Record<Currency, number> = {
  PHP: 58,
  USD: 1,
  EUR: 0.86,
  GBP: 0.75,
  JPY: 150,
  CNY: 7.1,
  HKD: 7.8,
  TWD: 31,
  KRW: 1400,
  SGD: 1.29,
  MYR: 4.2,
  THB: 32.5,
  IDR: 16500,
  VND: 26300,
  INR: 88,
  PKR: 282,
  BDT: 122,
  LKR: 302,
  NPR: 141,
  AUD: 1.52,
  NZD: 1.72,
  CAD: 1.39,
  MXN: 18.5,
  BRL: 5.4,
  ARS: 1450,
  CLP: 950,
  COP: 3900,
  PEN: 3.5,
  CHF: 0.8,
  SEK: 9.4,
  NOK: 10,
  DKK: 6.4,
  PLN: 3.65,
  CZK: 20.8,
  HUF: 335,
  TRY: 41.5,
  ILS: 3.3,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.306,
  BHD: 0.376,
  OMR: 0.3845,
  EGP: 48,
  ZAR: 17.5,
  NGN: 1500,
  KES: 129,
};

/**
 * The provider is third-party input: a quote more than this factor away from the reference is
 * a provider fault (or a hostile response) and is skipped, so it never becomes the basis every
 * balance in that currency is read through. The previous good quote stays in use.
 */
const PLAUSIBLE_FACTOR = 5;

const FETCH_TIMEOUT_MS = 5000;

export type UnitsPerUsd = Record<Currency, number>;

export interface FxQuotes {
  date: string;
  source: string;
  fetchedAt: string;
  /** Only the currencies the provider quoted plausibly; USD is always 1. */
  unitsPerUsd: Partial<UnitsPerUsd>;
}

function isPlausible(currency: Currency, rate: number): boolean {
  const reference = REFERENCE_UNITS_PER_USD[currency];
  return (
    Number.isFinite(rate) &&
    rate >= reference / PLAUSIBLE_FACTOR &&
    rate <= reference * PLAUSIBLE_FACTOR
  );
}

export async function fetchUsdQuotes(now = new Date()): Promise<FxQuotes> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`FX fetch failed with ${response.status}`);
    const payload: { result?: string; rates?: Record<string, unknown> } = await response.json();
    if (payload.result !== "success" || typeof payload.rates !== "object" || !payload.rates) {
      throw new Error("FX provider returned an unexpected payload");
    }
    const unitsPerUsd: Partial<UnitsPerUsd> = { USD: 1 };
    for (const [code, rate] of Object.entries(payload.rates)) {
      if (!isCurrency(code) || code === "USD" || typeof rate !== "number") continue;
      if (isPlausible(code, rate)) unitsPerUsd[code] = rate;
    }
    return {
      date: utcDate(now),
      source: FX_RATE_SOURCE,
      fetchedAt: now.toISOString(),
      unitsPerUsd,
    };
  } finally {
    clearTimeout(timer);
  }
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Store today's quotes if none are stored yet. Idempotent per date: a racing or repeated run
 * keeps the already-stored rows (INSERT OR IGNORE) and reports that nothing new was stored.
 */
export async function storeFxRates(env: Bindings, now = new Date()): Promise<FxQuotes | null> {
  const existing = await env.DB.prepare(
    "SELECT 1 AS found FROM fx_usd_rates WHERE date = ? LIMIT 1",
  )
    .bind(utcDate(now))
    .first<{ found: number }>();
  if (existing) return null;
  const quotes = await fetchUsdQuotes(now);
  await env.DB.batch(
    Object.entries(quotes.unitsPerUsd).map(([currency, rate]) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO fx_usd_rates (date, currency, units_per_usd, source, fetched_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(quotes.date, currency, rate, quotes.source, quotes.fetchedAt),
    ),
  );
  return quotes;
}

/** Daily maintenance entry point: fetch and store today's quotes. */
export async function refreshDailyFxRates(env: Bindings): Promise<FxQuotes | null> {
  try {
    return await storeFxRates(env);
  } catch (error) {
    console.log(
      JSON.stringify({
        message: "Daily FX refresh failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

/**
 * Each currency's most recent stored quote dated on or before `asOf`, so the last successful
 * fetch stays in use while the provider is down; the reference rate when none is stored.
 */
export async function loadUnitsPerUsd(
  env: Bindings,
  asOf = utcDate(new Date()),
): Promise<UnitsPerUsd> {
  const result = await env.DB.prepare(
    `SELECT currency, units_per_usd AS unitsPerUsd
     FROM (
       SELECT currency, units_per_usd,
              ROW_NUMBER() OVER (PARTITION BY currency ORDER BY date DESC) AS rank
       FROM fx_usd_rates
       WHERE date <= ?
     )
     WHERE rank = 1`,
  )
    .bind(asOf)
    .all<{ currency: string; unitsPerUsd: number }>();

  const rates: UnitsPerUsd = { ...REFERENCE_UNITS_PER_USD };
  for (const row of result.results) {
    if (isCurrency(row.currency) && Number(row.unitsPerUsd) > 0) {
      rates[row.currency] = Number(row.unitsPerUsd);
    }
  }
  return rates;
}

/** Converts minor units between currencies through USD, rounded to the nearest minor unit. */
export function convertMinor(
  amountMinor: number,
  from: Currency,
  to: Currency,
  rates: UnitsPerUsd,
): number {
  if (from === to) return amountMinor;
  return Math.round((amountMinor * rates[to]) / rates[from]);
}
