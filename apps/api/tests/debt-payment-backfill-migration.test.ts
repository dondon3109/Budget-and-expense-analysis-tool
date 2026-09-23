import { afterEach, describe, expect, it } from "vitest";

import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

interface DebtRow {
  id: string;
  balanceMinor: number;
  status: string;
  revision: number;
}

const DEBTS = `INSERT INTO debts (id, tenant_id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of, status) VALUES`;
const PAYMENTS = `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, source_kind, debt_id) VALUES`;

/**
 * Seeds debts whose linked payments predate the repository moving the balance, then lets 0063
 * reconcile them, and returns the debt rows the migration left behind.
 */
function reconcileLegacyDebts(seed: string): Record<string, DebtRow> {
  const { database } = createD1TestDatabase({
    beforeMigration({ database: migrating, name }) {
      if (name !== "0063_debt_payment_backfill.sql") return;
      migrating.exec(`
        INSERT INTO tenants (id, kind, name) VALUES ('tenant-legacy', 'user', 'Legacy');
        INSERT INTO accounts (id, tenant_id, name, type)
          VALUES ('account-legacy', 'tenant-legacy', 'Bank', 'bank');
        INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
          VALUES ('category-legacy', 'tenant-legacy', 'Debt payment', 'expense', '#e34948', 'free');
      `);
      migrating.exec(seed);
    },
  });
  databases.push(database);

  const rows = database
    .prepare("SELECT id, balance_minor AS balanceMinor, status, revision FROM debts")
    .all();
  return Object.fromEntries(
    rows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        balanceMinor: Number(row.balanceMinor),
        status: String(row.status),
        revision: Number(row.revision),
      },
    ]),
  );
}

describe("0063_debt_payment_backfill", () => {
  it("applies every payment already on file exactly once", () => {
    const debts = reconcileLegacyDebts(`
      ${DEBTS}
        ('debt-partial', 'tenant-legacy', 'Card', 'credit_card', 100000, 0, 1000, '2026-09-01', 'active'),
        ('debt-cleared', 'tenant-legacy', 'Loan', 'personal_loan', 50000, 0, 1000, '2026-09-01', 'active'),
        ('debt-untouched', 'tenant-legacy', 'Mortgage', 'mortgage', 700000, 0, 1000, '2026-09-01', 'active');
      ${PAYMENTS}
        ('payment-a', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-10', 'Card payment', -30000, 'PHP', 'expense', 'manual', 'debt-partial'),
        ('payment-b', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-11', 'Card payment', -20000, 'PHP', 'expense', 'manual', 'debt-partial'),
        ('payment-c', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-12', 'Loan payment', -50000, 'PHP', 'expense', 'manual', 'debt-cleared');
    `);

    expect(debts["debt-partial"]).toMatchObject({ balanceMinor: 50000, status: "active" });
    expect(debts["debt-cleared"]).toMatchObject({ balanceMinor: 0, status: "paid" });
    expect(debts["debt-untouched"]).toMatchObject({ balanceMinor: 700000, status: "active" });
    // The update trigger raises revision, and that is what emits the sync change for installed clients.
    expect(debts["debt-partial"]?.revision).toBeGreaterThan(1);
    expect(debts["debt-untouched"]?.revision).toBe(1);
  });

  it("floors at zero rather than crediting an overpayment", () => {
    const debts = reconcileLegacyDebts(`
      ${DEBTS}
        ('debt-overpaid', 'tenant-legacy', 'Card', 'credit_card', 10000, 0, 1000, '2026-09-01', 'active');
      ${PAYMENTS}
        ('payment-over', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-10', 'Card payment', -50000, 'PHP', 'expense', 'manual', 'debt-overpaid');
    `);

    expect(debts["debt-overpaid"]).toMatchObject({ balanceMinor: 0, status: "paid", revision: 2 });
  });

  it("leaves unlinked expenses and a link on a non-expense out of the balance", () => {
    const debts = reconcileLegacyDebts(`
      ${DEBTS}
        ('debt-clean', 'tenant-legacy', 'Card', 'credit_card', 80000, 0, 1000, '2026-09-01', 'active');
      ${PAYMENTS}
        ('payment-unlinked', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-10', 'Groceries', -15000, 'PHP', 'expense', 'manual', NULL),
        ('income-linked', 'tenant-legacy', 'account-legacy', 'category-legacy', '2026-09-11', 'Refund', 15000, 'PHP', 'income', 'manual', 'debt-clean');
    `);

    expect(debts["debt-clean"]).toMatchObject({
      balanceMinor: 80000,
      status: "active",
      revision: 1,
    });
  });
});
