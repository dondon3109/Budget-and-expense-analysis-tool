import { describe, expect, it, vi } from "vitest";

import {
  FALLBACK_USD_TO_PHP,
  fetchUsdToPhp,
  loadUsdToPhp,
  refreshDailyFxRate,
  storeFxRate,
} from "../src/fx/rates";
import type { Bindings } from "../src/types";

interface RateRow {
  date: string;
  usdToPhp: number;
  source: string;
  fetchedAt: string;
}

/**
 * Minimal fake D1 that answers the raw statements fx/rates.ts issues. It routes
 * by the SELECTed columns so each branch (existence check, full-row fetch, and
 * loadUsdToPhp) returns the right shape, and records inserts for assertions.
 */
function asBindings(rows: RateRow[]): { DB: Bindings["DB"]; inserted: RateRow[] } {
  const inserted: RateRow[] = [];
  const DB = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          const [date] = args as [string];
          function route(): RateRow | null {
            if (query.includes("SELECT date, usd_to_php")) {
              return rows.find((r) => r.date === date) ?? null;
            }
            if (query.includes("SELECT usd_to_php")) {
              return rows.find((r) => r.date === date) ?? null;
            }
            return rows.find((r) => r.date === date) ? (rows[0] ?? null) : null;
          }
          return {
            async first() {
              return route();
            },
            async run() {
              inserted.push({ date, usdToPhp: 999, source: "x", fetchedAt: "x" });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { DB: DB as unknown as Bindings["DB"], inserted };
}

describe("fx rates", () => {
  it("parses a valid open.er-api.com payload", async () => {
    const now = new Date("2026-08-07T12:00:00Z");
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: { PHP: 59.4 } }),
    } as Response);

    const result = await fetchUsdToPhp(now);
    expect(result).toEqual({
      date: "2026-08-07",
      usdToPhp: 59.4,
      source: "open.er-api.com",
      fetchedAt: now.toISOString(),
    });
    stub.mockRestore();
  });

  it("throws on a non-success payload", async () => {
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "error" }),
    } as Response);
    await expect(fetchUsdToPhp()).rejects.toThrow();
    stub.mockRestore();
  });

  it("fetches and stores today's rate, then returns it", async () => {
    const { DB, inserted } = asBindings([]);
    const now = new Date("2026-08-07T00:05:00Z");
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: { PHP: 59.4 } }),
    } as Response);

    const stored = await storeFxRate({ DB } as unknown as Bindings, now);
    expect(stored?.usdToPhp).toBe(59.4);
    expect(stored?.date).toBe("2026-08-07");
    expect(inserted).toHaveLength(1);
    stub.mockRestore();
  });

  it("does not refetch a rate already stored for the day (idempotent)", async () => {
    const { DB } = asBindings([
      { date: "2026-08-07", usdToPhp: 58.1, source: "open.er-api.com", fetchedAt: "x" },
    ]);
    const now = new Date("2026-08-07T00:05:00Z");
    const stub = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: { PHP: 59.4 } }),
    } as Response);

    const stored = await storeFxRate({ DB } as unknown as Bindings, now);
    expect(stored?.usdToPhp).toBe(58.1);
    expect(stub).not.toHaveBeenCalled();
    stub.mockRestore();
  });

  it("loadUsdToPhp returns the stored rate for the requested date", async () => {
    const { DB } = asBindings([
      { date: "2026-08-06", usdToPhp: 58.9, source: "open.er-api.com", fetchedAt: "x" },
    ]);
    expect(await loadUsdToPhp({ DB } as unknown as Bindings, "2026-08-06")).toBe(58.9);
  });

  it("falls back to the fallback rate when nothing has ever been stored", async () => {
    const { DB } = asBindings([]);
    expect(await loadUsdToPhp({ DB } as unknown as Bindings, "2026-08-07")).toBe(
      FALLBACK_USD_TO_PHP,
    );
  });

  it("refreshDailyFxRate returns null on provider failure without throwing", async () => {
    const { DB } = asBindings([]);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    await expect(refreshDailyFxRate({ DB } as unknown as Bindings)).resolves.toBeNull();
  });
});
