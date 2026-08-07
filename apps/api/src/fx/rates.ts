import type { Bindings } from "../types";

/**
 * Daily USD → PHP exchange rate, fetched once per day by the maintenance cron
 * and stored per date. The chart converts USD transactions to a common PHP base
 * using the most recent stored rate so weekly/monthly/six-month cashflow is a
 * single, consistent picture.
 */

export const FX_RATE_SOURCE = "open.er-api.com";

/** Fallback used only if the provider is unreachable AND no rate has ever been stored. */
export const FALLBACK_USD_TO_PHP = 59;

const FETCH_TIMEOUT_MS = 5000;

export interface FxRateResult {
  date: string;
  usdToPhp: number;
  source: string;
  fetchedAt: string;
}

export async function fetchUsdToPhp(now = new Date()): Promise<FxRateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`FX fetch failed with ${response.status}`);
    const payload = (await response.json()) as { result?: string; rates?: Record<string, number> };
    if (payload.result !== "success" || typeof payload.rates?.PHP !== "number") {
      throw new Error("FX provider returned an unexpected payload");
    }
    const usdToPhp = payload.rates.PHP;
    const date = now.toISOString().slice(0, 10);
    return { date, usdToPhp, source: FX_RATE_SOURCE, fetchedAt: now.toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Store today's rate if not already present. Idempotent per date: a racing or
 * repeated run returns the already-stored row without overwriting it.
 */
export async function storeFxRate(
  env: Bindings,
  now = new Date(),
): Promise<FxRateResult | null> {
  const date = utcDate(now);
  const existing = await env.DB.prepare("SELECT date FROM fx_rates WHERE date = ?")
    .bind(date)
    .first<{ date: string }>();
  if (existing) {
    const row = await env.DB.prepare(
      "SELECT date, usd_to_php AS usdToPhp, source, fetched_at AS fetchedAt FROM fx_rates WHERE date = ?",
    )
      .bind(date)
      .first<FxRateResult>();
    return row ?? null;
  }
  const rate = await fetchUsdToPhp(now);
  await env.DB.prepare(
    "INSERT INTO fx_rates (date, usd_to_php, source, fetched_at) VALUES (?, ?, ?, ?)",
  )
    .bind(rate.date, rate.usdToPhp, rate.source, rate.fetchedAt)
    .run();
  return rate;
}

/** Daily maintenance entry point: fetch and store today's rate. */
export async function refreshDailyFxRate(env: Bindings): Promise<FxRateResult | null> {
  try {
    return await storeFxRate(env);
  } catch (error) {
    console.log(
      JSON.stringify({ message: "Daily FX refresh failed", error: error instanceof Error ? error.message : String(error) }),
    );
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface StoredFxRow {
  date: string;
  usdToPhp: number;
}

/**
 * Most recent stored rate where `date <= asOf`. Falls back to the very latest
 * stored rate on any date, keeping the last successful fetch usable offline or
 * before any cron has run.
 */
export async function loadUsdToPhp(env: Bindings, asOf = utcDate(new Date())): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT usd_to_php AS usdToPhp
     FROM fx_rates
     WHERE date <= ?
     ORDER BY date DESC
     LIMIT 1`,
  )
    .bind(asOf)
    .first<StoredFxRow>();
  return row ? Number(row.usdToPhp) : FALLBACK_USD_TO_PHP;
}
