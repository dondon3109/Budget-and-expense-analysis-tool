import { describe, expect, it } from "vitest";

import { creditDueInterest } from "../src/interest/scheduled-credit";

interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

type AllResult = Record<string, unknown>[];

function createDatabase(options: {
  rows: AllResult;
  categoryId?: string;
  balance?: number;
  existingFingerprint?: string;
}): { statements: CapturedStatement[]; batchCalls: D1PreparedStatement[][]; db: D1Database } {
  const statements: CapturedStatement[] = [];
  const batchCalls: D1PreparedStatement[][] = [];

  const database = {
    prepare(query: string) {
      let captured: unknown[] = [];
      const statement = {
        bind(...bindings: unknown[]) {
          captured = bindings;
          statements.push({ query, bindings });
          return statement;
        },
        async all() {
          return { results: options.rows };
        },
        async first() {
          let result: Record<string, unknown> | null = null;
          if (query.includes("system_key = ?")) {
            result = options.categoryId ? { id: options.categoryId } : null;
          } else if (query.includes("COALESCE(SUM(CASE")) {
            result = { balance: options.balance ?? 0 };
          } else if (query.includes("import_fingerprint = ?")) {
            result = captured[1] === options.existingFingerprint ? { matched: 1 } : null;
          }
          return result;
        },
        async run() {
          throw new Error("run is not used in this test");
        },
        async raw() {
          throw new Error("raw is not used in this test");
        },
      };
      return statement;
    },
    async batch(statementsToRun: D1PreparedStatement[]) {
      batchCalls.push(statementsToRun);
      return [];
    },
    async exec() {
      throw new Error("exec is not used in this test");
    },
    async dump() {
      throw new Error("dump is not used in this test");
    },
  } as unknown as D1Database;

  return { statements, batchCalls, db: database };
}
const accountRows = [
  {
    id: "savings-1",
    tenantId: "user:user-1",
    annualRateBasisPoints: 500,
    interestFrequency: "daily",
    interestPayDay: null,
  },
];

describe("creditDueInterest", () => {
  it("credits daily interest equal to the floored daily amount", async () => {
    const { statements, batchCalls, db } = createDatabase({
      rows: accountRows,
      categoryId: "cat-interest",
      balance: 1_000_000,
    });
    const env = { DB: db };
    const result = await creditDueInterest(env, "2026-08-06");

    expect(result).toEqual({ checked: 1, credited: 1, skipped: 0 });
    expect(batchCalls).toHaveLength(1);
    const insert = statements.find((statement) => statement.query.includes("INSERT INTO transactions"));
    expect(insert).toBeDefined();
    const [, , accountId, categoryId, date, amountMinor, fingerprint] = insert!.bindings;
    expect(accountId).toBe("savings-1");
    expect(categoryId).toBe("cat-interest");
    expect(date).toBe("2026-08-06");
    // 1000000 * 0.05 / 365 floored = 136
    expect(amountMinor).toBe(136);
    // fingerprint present and deterministic
    expect(fingerprint).toBe("interest:user:user-1:savings-1:2026-08-06:daily");
  });

  it("credits monthly interest on the chosen pay day", async () => {
    const monthlyRows = [
      {
        id: "savings-2",
        tenantId: "user:user-1",
        annualRateBasisPoints: 500,
        interestFrequency: "monthly",
        interestPayDay: 15,
      },
    ];
    const { batchCalls, db } = createDatabase({
      rows: monthlyRows,
      categoryId: "c",
      balance: 1_000_000,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-15");
    expect(result).toEqual({ checked: 1, credited: 1, skipped: 0 });
    expect(batchCalls).toHaveLength(1);
  });

  it("does not credit monthly interest off the pay day", async () => {
    const monthlyRows = [
      {
        id: "savings-2",
        tenantId: "user:user-1",
        annualRateBasisPoints: 500,
        interestFrequency: "monthly",
        interestPayDay: 15,
      },
    ];
    const { batchCalls, db } = createDatabase({
      rows: monthlyRows,
      categoryId: "c",
      balance: 1_000_000,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-14");
    expect(result).toEqual({ checked: 1, credited: 0, skipped: 0 });
    expect(batchCalls).toHaveLength(0);
  });

  it("does not re-credit an already-credited period (idempotent fingerprint)", async () => {
    const existing = "interest:user:user-1:savings-1:2026-08-06:daily";
    const { batchCalls, db } = createDatabase({
      rows: accountRows,
      categoryId: "c",
      balance: 1_000_000,
      existingFingerprint: existing,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result).toEqual({ checked: 1, credited: 0, skipped: 0 });
    expect(batchCalls).toHaveLength(0);
  });

  it("does not insert a zero-amount credit", async () => {
    const { batchCalls, db } = createDatabase({
      rows: accountRows,
      categoryId: "c",
      balance: 100,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result.credited).toBe(0);
    expect(result.skipped).toBe(1);
    expect(batchCalls).toHaveLength(0);
  });
});
