import { afterEach, describe, expect, it, vi } from "vitest";

import {
  convertMinor,
  fetchUsdQuotes,
  loadUnitsPerUsd,
  refreshDailyFxRates,
  REFERENCE_UNITS_PER_USD,
  storeFxRates,
} from "../src/fx/rates";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

function stubProvider(rates: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ result: "success", rates }),
  } as Response);
}

function bindings() {
  const { binding, database } = createD1TestDatabase();
  return { env: { DB: binding } as unknown as Bindings, database };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fx rates", () => {
  it("keeps supported, plausible quotes and drops the rest", async () => {
    stubProvider({ PHP: 59.4, EUR: 0.9, JPY: 99_999, XAU: 0.0003, KRW: "1400" });

    const quotes = await fetchUsdQuotes(new Date("2026-08-07T12:00:00Z"));

    expect(quotes.date).toBe("2026-08-07");
    expect(quotes.unitsPerUsd).toEqual({ USD: 1, PHP: 59.4, EUR: 0.9 });
  });

  it("throws on a non-success payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "error" }),
    } as Response);
    await expect(fetchUsdQuotes()).rejects.toThrow();
  });

  it("stores a day's quotes once and reads the latest on or before a date", async () => {
    const { env } = bindings();
    const fetch = stubProvider({ PHP: 59.4, EUR: 0.9 });

    expect(await storeFxRates(env, new Date("2026-08-06T00:05:00Z"))).not.toBeNull();
    fetch.mockClear();
    expect(await storeFxRates(env, new Date("2026-08-06T09:00:00Z"))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    stubProvider({ PHP: 60.1 });
    await storeFxRates(env, new Date("2026-08-08T00:05:00Z"));

    const asOfSeventh = await loadUnitsPerUsd(env, "2026-08-07");
    expect(asOfSeventh.PHP).toBe(59.4);
    expect(asOfSeventh.EUR).toBe(0.9);
    const asOfEighth = await loadUnitsPerUsd(env, "2026-08-08");
    expect(asOfEighth.PHP).toBe(60.1);
    // EUR was not quoted on the 8th, so the 6th's quote stays in use.
    expect(asOfEighth.EUR).toBe(0.9);
    expect(asOfEighth.GBP).toBe(REFERENCE_UNITS_PER_USD.GBP);
  });

  it("carries the USD-to-PHP history stored before the multi-currency table", () => {
    const { database } = createD1TestDatabase({
      beforeMigration: ({ database, name }) => {
        if (name !== "0071_multi_currency.sql") return;
        database
          .prepare(
            "INSERT INTO fx_rates (date, usd_to_php, source, fetched_at) VALUES ('2026-08-01', 58.5, 'open.er-api.com', 'x')",
          )
          .run();
      },
    });

    expect(
      database.prepare("SELECT currency, units_per_usd AS rate FROM fx_usd_rates").all(),
    ).toEqual([{ currency: "PHP", rate: 58.5 }]);
  });

  it("refreshDailyFxRates returns null on provider failure without throwing", async () => {
    const { env } = bindings();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    await expect(refreshDailyFxRates(env)).resolves.toBeNull();
  });

  it("converts between any two currencies through USD", () => {
    const rates = { ...REFERENCE_UNITS_PER_USD, PHP: 58, EUR: 0.8, JPY: 150 };
    expect(convertMinor(10_000, "USD", "PHP", rates)).toBe(580_000);
    expect(convertMinor(580_000, "PHP", "USD", rates)).toBe(10_000);
    expect(convertMinor(8_000, "EUR", "JPY", rates)).toBe(1_500_000);
    expect(convertMinor(1_234, "EUR", "EUR", rates)).toBe(1_234);
  });
});
