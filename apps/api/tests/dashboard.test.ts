import { describe, expect, it } from "vitest";

import { loadDashboard } from "../src/db/dashboard";
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
            async raw() {
              return [];
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function findTransactionStatement(statements: CapturedStatement[]): CapturedStatement {
  const statement = statements.find(({ query }) =>
    query.toLowerCase().includes('from "transactions"'),
  );
  if (!statement) throw new Error("Expected a dashboard transaction query.");
  return statement;
}

describe("loadDashboard account filtering", () => {
  const period = { from: "2026-07-01", to: "2026-07-31" };

  it("keeps the tenant predicate and adds the resolved account predicate", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await loadDashboard(env, "tenant-1", period, "account-1");

    const transactionStatement = findTransactionStatement(statements);
    expect(transactionStatement.query).toContain('"transactions"."tenant_id" = ?');
    expect(transactionStatement.query).toContain('"transactions"."account_id" = ?');
    expect(transactionStatement.bindings).toContain("tenant-1");
    expect(transactionStatement.bindings).toContain("account-1");
  });

  it("does not add an account predicate for the regular dashboard", async () => {
    const statements: CapturedStatement[] = [];
    const env: Bindings = { DB: createCapturingDatabase(statements) };

    await loadDashboard(env, "tenant-1", period);

    const transactionStatement = findTransactionStatement(statements);
    expect(transactionStatement.query).toContain('"transactions"."tenant_id" = ?');
    expect(transactionStatement.query).not.toContain('"transactions"."account_id" = ?');
    expect(transactionStatement.bindings).toContain("tenant-1");
    expect(transactionStatement.bindings).not.toContain("account-1");
  });
});
