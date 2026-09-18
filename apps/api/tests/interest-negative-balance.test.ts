import type { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { interestAmountMinor } from "../src/interest/credit";
import { creditDueInterest } from "../src/interest/scheduled-credit";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";
import { grantMobileSyncTestPro } from "./helpers/mobile-sync-test-environment";

const TENANT_ID = "user:user-1";
const CREDIT_DATE = "2026-08-06";

/**
 * A Pro savings account whose only transaction is `balanceMinor`, so any credited interest can
 * only come from the balance the account actually holds.
 */
function savingsEnvironment(balanceMinor: number): { env: Bindings; database: DatabaseSync } {
  const { binding, database } = createD1TestDatabase();
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
  database
    .prepare(
      `INSERT INTO accounts (
         id, tenant_id, name, type, currency, interest_enabled, annual_rate_basis_points,
         interest_frequency, interest_pay_day
       ) VALUES ('savings-1', ?, 'Savings', 'savings', 'PHP', 1, 500, 'daily', NULL)`,
    )
    .run(TENANT_ID);
  database
    .prepare(
      `INSERT INTO categories (id, tenant_id, name, kind, color, system_key)
       VALUES ('interest-income', ?, 'Interest', 'income', '#123456', 'interest:income')`,
    )
    .run(TENANT_ID);
  if (balanceMinor !== 0) {
    database
      .prepare(
        `INSERT INTO transactions (
           id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
         ) VALUES ('tx-1', ?, 'savings-1', 'interest-income', '2026-08-01', 'Opening', ?, 'PHP', ?)`,
      )
      .run(TENANT_ID, balanceMinor, balanceMinor > 0 ? "income" : "expense");
  }
  grantMobileSyncTestPro(database, TENANT_ID);
  return { env: { DB: binding }, database };
}

function creditedInterestCount(database: DatabaseSync): number {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE tenant_id = ? AND description = 'Interest'")
    .get(TENANT_ID) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

describe("interestAmountMinor sign handling", () => {
  it("pays nothing on a zero or negative balance", () => {
    expect(interestAmountMinor(0, 500, "daily")).toBe(0);
    expect(interestAmountMinor(-1_000_000, 500, "daily")).toBe(0);
    expect(interestAmountMinor(-1_000_000, 500, "monthly")).toBe(0);
    expect(interestAmountMinor(-1_000_000, 500, "yearly")).toBe(0);
  });

  it("keeps paying on a positive balance", () => {
    expect(interestAmountMinor(1_000_000, 500, "daily")).toBe(136);
    expect(interestAmountMinor(1_000_000, 500, "monthly")).toBe(4166);
  });
});

describe("creditDueInterest on a non-positive balance", () => {
  it("credits nothing when spending drove the savings balance below zero", async () => {
    const { env, database } = savingsEnvironment(-200_000);

    const result = await creditDueInterest(env, CREDIT_DATE);

    expect(result).toEqual({ checked: 1, credited: 0, skipped: 1 });
    expect(creditedInterestCount(database)).toBe(0);
  });

  it("credits nothing on an empty savings account", async () => {
    const { env, database } = savingsEnvironment(0);

    const result = await creditDueInterest(env, CREDIT_DATE);

    expect(result).toEqual({ checked: 1, credited: 0, skipped: 1 });
    expect(creditedInterestCount(database)).toBe(0);
  });

  it("still credits a positive savings balance", async () => {
    const { env, database } = savingsEnvironment(1_000_000);

    const result = await creditDueInterest(env, CREDIT_DATE);

    expect(result).toEqual({ checked: 1, credited: 1, skipped: 0 });
    const row = database
      .prepare(
        "SELECT amount_minor AS amountMinor FROM transactions WHERE tenant_id = ? AND description = 'Interest'",
      )
      .get(TENANT_ID) as { amountMinor: number } | undefined;
    expect(row?.amountMinor).toBe(136);
  });
});
