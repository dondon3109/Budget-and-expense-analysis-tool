import { describe, expect, it } from "vitest";

import { buildTransferLegs, transactionRepository } from "../src/db/transactions";
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

describe("transactionRepository ordering", () => {
  async function captureListQuery(query: {
    sortBy: "date" | "description" | "amount";
    sortDirection: "asc" | "desc";
  }) {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };
    await transactionRepository.list(env, "tenant-1", { page: 1, pageSize: 10, ...query });
    return statements[0]?.query ?? "";
  }

  it("keeps newer-created transactions first within each date", async () => {
    await expect(captureListQuery({ sortBy: "date", sortDirection: "desc" })).resolves.toContain(
      "ORDER BY t.date DESC, t.created_at DESC, t.id DESC",
    );
    await expect(captureListQuery({ sortBy: "date", sortDirection: "asc" })).resolves.toContain(
      "ORDER BY t.date ASC, t.created_at DESC, t.id DESC",
    );
  });

  it("uses recent transactions as stable ties for description and amount", async () => {
    await expect(
      captureListQuery({ sortBy: "description", sortDirection: "asc" }),
    ).resolves.toContain("ORDER BY t.description ASC, t.date DESC, t.created_at DESC, t.id DESC");
    await expect(captureListQuery({ sortBy: "amount", sortDirection: "desc" })).resolves.toContain(
      "ORDER BY ABS(t.amount_minor) DESC, t.date DESC, t.created_at DESC, t.id DESC",
    );
  });
});

describe("transactionRepository search", () => {
  it("searches both sides of linked transfers with escaped literals", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };
    await transactionRepository.list(env, "tenant-1", {
      page: 1,
      pageSize: 10,
      sortBy: "date",
      sortDirection: "desc",
      search: "50%_off\\deal",
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toContain("LEFT JOIN transactions peer");
    expect(statements[0]?.query).toContain("COALESCE(destination.name, '') LIKE ? ESCAPE");
    expect(statements[0]?.query).toContain("t.tenant_id = ?");
    expect(statements[0]?.bindings).toContain("%50\\%\\_off\\\\deal%");
  });
});
describe("buildTransferLegs transfer fees", () => {
  it("deducts the fee from the receiving leg and records it on the sender leg", () => {
    const [fromLeg, toLeg] = buildTransferLegs({
      date: "2026-07-20",
      description: "",
      amountMinor: 10_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
      fromAccountId: "account-a",
      toAccountId: "account-b",
      transferFeeMinor: 1_000,
    });

    expect(fromLeg).toEqual({
      accountId: "account-a",
      amountMinor: -10_000,
      transferFeeMinor: 1_000,
      description: "Transfer",
    });
    expect(toLeg).toEqual({
      accountId: "account-b",
      amountMinor: 9_000,
      transferFeeMinor: null,
      description: "Transfer",
    });
  });

  it("defaults a missing fee to zero and keeps both legs symmetric", () => {
    const [fromLeg, toLeg] = buildTransferLegs({
      date: "2026-07-20",
      description: "Savings top-up",
      amountMinor: 5_000,
      currency: "PHP",
      kind: "transfer",
      categoryId: "transfer",
      fromAccountId: "account-a",
      toAccountId: "account-b",
    });

    expect(fromLeg).toEqual({
      accountId: "account-a",
      amountMinor: -5_000,
      transferFeeMinor: null,
      description: "Savings top-up",
    });
    expect(toLeg).toEqual({
      accountId: "account-b",
      amountMinor: 5_000,
      transferFeeMinor: null,
      description: "Savings top-up",
    });
  });
});
