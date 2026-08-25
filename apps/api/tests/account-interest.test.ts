import { beforeEach, describe, expect, it, vi } from "vitest";

import { creditDueInterest } from "../src/interest/scheduled-credit";

interface CapturedStatement {
  query: string;
  bindings: unknown[];
}

type AllResult = Record<string, unknown>[];

function createDatabase(options: {
  accounts: AllResult;
  categoryId?: string;
  balance?: number;
  existingFingerprint?: string;
  failFirstBatch?: boolean;
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
          if (query.includes("FROM accounts")) {
            return { results: options.accounts };
          }
          if (query.includes("system_key = ?")) {
            return {
              results: options.categoryId
                ? options.accounts.map((account) => ({
                    tenantId: account.tenantId,
                    id: options.categoryId,
                  }))
                : [],
            };
          }
          if (query.includes("GROUP BY account_id")) {
            return {
              results: options.accounts.map((account) => ({
                accountId: account.id,
                balance: options.balance ?? 0,
              })),
            };
          }
          if (query.includes("import_fingerprint IN")) {
            const matched =
              options.existingFingerprint !== undefined &&
              captured.includes(options.existingFingerprint);
            return {
              results: matched ? [{ import_fingerprint: options.existingFingerprint }] : [],
            };
          }
          throw new Error(`Unexpected query in test: ${query}`);
        },
        async first() {
          throw new Error("first is not used in this test");
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
      if (options.failFirstBatch && batchCalls.length === 0) {
        batchCalls.push([...statementsToRun]);
        throw new Error("UNIQUE constraint failed: transactions_tenant_fingerprint_unique");
      }
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
    hasPro: 1,
  },
];

describe("creditDueInterest", () => {
  beforeEach(() => {
    // Entitlement comes from the batched accounts query, not a per-tenant lookup.
  });

  it("credits daily interest equal to the floored daily amount", async () => {
    const { statements, batchCalls, db } = createDatabase({
      accounts: accountRows,
      categoryId: "cat-interest",
      balance: 1_000_000,
    });
    const env = { DB: db };
    const result = await creditDueInterest(env, "2026-08-06");

    expect(result).toEqual({ checked: 1, credited: 1, skipped: 0 });
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(1);
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

  it("credits multiple accounts across tenants in one batch", async () => {
    const multiRows = [
      { ...accountRows[0]! },
      {
        id: "savings-3",
        tenantId: "user:user-2",
        annualRateBasisPoints: 500,
        interestFrequency: "daily",
        interestPayDay: null,
        hasPro: 1,
      },
    ];
    const { statements, batchCalls, db } = createDatabase({
      accounts: multiRows,
      categoryId: "c",
      balance: 1_000_000,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result).toEqual({ checked: 2, credited: 2, skipped: 0 });
    expect(batchCalls).toHaveLength(1);
    expect(statements.filter((s) => s.query.includes("INSERT INTO transactions"))).toHaveLength(2);
  });

  it("credits monthly interest on the chosen pay day", async () => {
    const monthlyRows = [
      {
        id: "savings-2",
        tenantId: "user:user-1",
        annualRateBasisPoints: 500,
        interestFrequency: "monthly",
        interestPayDay: 15,
        hasPro: 1,
      },
    ];
    const { batchCalls, db } = createDatabase({
      accounts: monthlyRows,
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
        hasPro: 1,
      },
    ];
    const { batchCalls, db } = createDatabase({
      accounts: monthlyRows,
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
      accounts: accountRows,
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
      accounts: accountRows,
      categoryId: "c",
      balance: 100,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result.credited).toBe(0);
    expect(result.skipped).toBe(1);
    expect(batchCalls).toHaveLength(0);
  });

  it("skips interest for a tenant without a Pro entitlement (Pro-only feature)", async () => {
    const { statements, batchCalls, db } = createDatabase({
      accounts: [{ ...accountRows[0]!, hasPro: 0 }],
      categoryId: "cat-interest",
      balance: 1_000_000,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result).toEqual({ checked: 1, credited: 0, skipped: 1 });
    expect(batchCalls).toHaveLength(0);
    // A free tenant must never reach the category or balance lookups.
    expect(statements.some((s) => s.query.includes("system_key = ?"))).toBe(false);
  });

  it("chunks lookups under the D1 bind-parameter limit and scopes balances by tenant", async () => {
    const manyAccounts = Array.from({ length: 200 }, (_, index) => ({
      id: `savings-${index}`,
      tenantId: `user:user-${index % 10}`,
      annualRateBasisPoints: 500,
      interestFrequency: "daily",
      interestPayDay: null,
      hasPro: 1,
    }));
    const { statements, batchCalls, db } = createDatabase({
      accounts: manyAccounts,
      categoryId: "c",
      balance: 1_000_000,
    });
    const result = await creditDueInterest({ DB: db }, "2026-08-06");
    expect(result.checked).toBe(200);
    expect(result.credited).toBe(200);
    // Balances are one chunked query per tenant (20 accounts each, under the limit).
    const balanceQueries = statements.filter((s) => s.query.includes("GROUP BY account_id"));
    expect(balanceQueries).toHaveLength(10);
    for (const query of balanceQueries) {
      expect(query.query).toContain("tenant_id = ?");
      expect(query.bindings[0]).toMatch(/^user:user-\d+$/);
    }
    // 200 fingerprints / 90 per chunk = 3 chunked fingerprint lookups.
    expect(statements.filter((s) => s.query.includes("import_fingerprint IN"))).toHaveLength(3);
    expect(batchCalls).toHaveLength(1);
  });

  it("credits remaining accounts individually when the batch insert fails", async () => {
    const { batchCalls, db } = createDatabase({
      accounts: [
        { ...accountRows[0]! },
        {
          id: "savings-2",
          tenantId: "user:user-1",
          annualRateBasisPoints: 500,
          interestFrequency: "daily",
          interestPayDay: null,
          hasPro: 1,
        },
      ],
      categoryId: "c",
      balance: 1_000_000,
      failFirstBatch: true,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await creditDueInterest({ DB: db }, "2026-08-06");

    // The failed group batch falls back to per-account batches; both succeed there.
    expect(result.credited).toBe(2);
    expect(batchCalls).toHaveLength(3);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
