import { describe, expect, it } from "vitest";

import { loadTransferFeeInsight } from "../src/db/dashboard";
import type { Bindings } from "../src/types";

interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

function createCapturingDatabase(statements: CapturedStatement[]): D1Database {
  return {
    prepare(query: string) {
      return {
        bind(...bindings: unknown[]) {
          statements.push({ query, bindings });
          return {
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("loadTransferFeeInsight", () => {
  it("queries all-time totals and recent transfer sender legs per tenant", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await loadTransferFeeInsight(env, "tenant-1", "2026-08-05");

    expect(statements).toHaveLength(2);
    const [totals, recent] = statements;

    expect(totals!.query).toContain("kind = 'transfer'");
    expect(totals!.query).toContain("amount_minor < 0");
    expect(totals!.query).toContain("GROUP BY currency");
    expect(totals!.query).toContain("SUM(transfer_fee_minor)");
    expect(totals!.bindings).toEqual(["tenant-1"]);

    expect(recent!.query).toContain("kind = 'transfer'");
    expect(recent!.query).toContain("amount_minor < 0");
    expect(recent!.bindings).toEqual(["tenant-1", "2026-06-10"]);
  });

  it("builds an insight with a fee-charged transfer from returned rows", async () => {
    let call = 0;
    const env: Bindings = {
      DB: {
        prepare() {
          return {
            bind() {
              call += 1;
              const isTotals = call === 1;
              return {
                async all() {
                  if (isTotals) {
                    return {
                      results: [
                        {
                          currency: "PHP",
                          transfers: 2,
                          feeChargedTransfers: 1,
                          totalFeesMinor: 150,
                        },
                      ],
                    };
                  }
                  return {
                    results: [
                      {
                        date: "2026-08-03",
                        currency: "PHP",
                        transferFeeMinor: 150,
                      },
                      {
                        date: "2026-08-04",
                        currency: "PHP",
                        transferFeeMinor: null,
                      },
                    ],
                  };
                },
              };
            },
          };
        },
      },
    } as unknown as Bindings;

    const insight = await loadTransferFeeInsight(env, "tenant-1", "2026-08-05");

    expect(insight).toMatchObject({
      hasFees: true,
      totalTransfers: 2,
      totalFeeChargedTransfers: 1,
      feesByCurrency: { PHP: 150, USD: 0 },
      recentWeekCount: 1,
      recentAverageTransfersPerWeek: 2,
      recentAverageFeeChargedTransfersPerWeek: 1,
    });
    expect(insight.weekly).toEqual([
      {
        weekStart: "2026-08-03",
        weekEnd: "2026-08-09",
        transfers: 2,
        feeChargedTransfers: 1,
        feesByCurrency: { PHP: 150, USD: 0 },
      },
    ]);
  });
});
