import { afterEach, describe, expect, it } from "vitest";

import { accountRepository } from "../src/db/accounts";
import { subscriptionRepository } from "../src/db/subscriptions";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function seededEnvironment(): {
  env: Bindings;
  database: ReturnType<typeof createD1TestDatabase>["database"];
} {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES ('tenant-1', 'user', 'One');
    INSERT INTO accounts (id, tenant_id, name, type) VALUES ('account-1', 'tenant-1', 'Bank', 'bank');
    INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
      VALUES ('category-1', 'tenant-1', 'Entertainment', 'expense', '#123456', 'free');
    INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
    ) VALUES (
      'opening-balance', 'tenant-1', 'account-1', 'category-1', '2026-08-01',
      'Opening balance', 100000, 'PHP', 'income'
    );
  `);
  return { env: { DB: binding }, database };
}

describe("subscription schedules", () => {
  it("creates a subscription and automatically adds a transaction, and cancelling it does not refund the account balance", async () => {
    const { env, database } = seededEnvironment();
    await subscriptionRepository.create(env, "tenant-1", {
      name: "Music streaming",
      amountMinor: 19_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-25",
      categoryId: "category-1",
      accountId: "account-1",
    });

    const subscriptionId = String(
      database.prepare("SELECT id FROM subscriptions LIMIT 1").get()?.id,
    );
    expect(
      database.prepare("SELECT status FROM subscriptions WHERE id = ?").get(subscriptionId),
    ).toEqual({
      status: "active",
    });

    // An expense transaction is automatically added for the subscription
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(subscriptionId),
    ).toEqual({ count: 1 });

    const charge = database
      .prepare(
        "SELECT account_id AS accountId, category_id AS categoryId, date, description, amount_minor AS amountMinor, kind FROM transactions WHERE subscription_id = ?",
      )
      .get(subscriptionId);
    expect(charge).toEqual({
      accountId: "account-1",
      categoryId: "category-1",
      date: "2026-09-25",
      description: "Music streaming",
      amountMinor: -19_900,
      kind: "expense",
    });

    // Account balance reflects the charge (100,000 - 19,900 = 80,100)
    await expect(accountRepository.list(env, "tenant-1")).resolves.toMatchObject([
      { id: "account-1", balanceMinor: 80_100 },
    ]);

    // Cancelling the subscription does not delete the transaction or refund the amount
    await subscriptionRepository.setStatus(env, "tenant-1", subscriptionId, { status: "canceled" });

    expect(
      database.prepare("SELECT status FROM subscriptions WHERE id = ?").get(subscriptionId),
    ).toEqual({ status: "canceled" });

    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id = ?")
        .get(subscriptionId),
    ).toEqual({ count: 1 });

    // Balance remains 80,100 (no refund)
    await expect(accountRepository.list(env, "tenant-1")).resolves.toMatchObject([
      { id: "account-1", balanceMinor: 80_100 },
    ]);
  });

  it("preserves recorded history while removing future projections for mobile sync", () => {
    const { database } = createD1TestDatabase({
      beforeMigration({ database: migrating, name }) {
        if (name !== "0043_subscription_schedules.sql") return;
        migrating.exec(`
          INSERT INTO tenants (id, kind, name) VALUES ('tenant-legacy', 'user', 'Legacy');
          INSERT INTO accounts (id, tenant_id, name, type)
            VALUES ('account-legacy', 'tenant-legacy', 'Bank', 'bank');
          INSERT INTO categories (id, tenant_id, name, kind, color, required_plan)
            VALUES ('category-legacy', 'tenant-legacy', 'Bills', 'expense', '#123456', 'free');
          INSERT INTO subscriptions (
            id, tenant_id, account_id, category_id, name, amount_minor,
            billing_cycle, next_billing_date, status
          ) VALUES (
            'subscription-legacy', 'tenant-legacy', 'account-legacy', 'category-legacy',
            'Legacy plan', 50000, 'monthly', '2026-09-01', 'active'
          );
          INSERT INTO transactions (
            id, tenant_id, account_id, category_id, date, description, amount_minor,
            currency, kind, source_kind, subscription_id
          ) VALUES (
            'charge-legacy', 'tenant-legacy', 'account-legacy', 'category-legacy',
            '2099-09-01', 'Legacy plan', -50000, 'PHP', 'expense', 'manual',
            'subscription-legacy'
          ), (
            'charge-history', 'tenant-legacy', 'account-legacy', 'category-legacy',
            '2026-01-01', 'Paid legacy plan', -50000, 'PHP', 'expense', 'manual',
            'subscription-legacy'
          );
        `);
      },
    });
    databases.push(database);

    expect(
      database
        .prepare(
          "SELECT id, amount_minor AS amountMinor, subscription_id AS subscriptionId FROM transactions",
        )
        .get(),
    ).toEqual({
      id: "charge-history",
      amountMinor: -50_000,
      subscriptionId: null,
    });
    expect(
      database
        .prepare(
          "SELECT entity_type AS entityType, entity_id AS entityId, operation FROM mobile_sync_changes WHERE entity_id = 'charge-legacy' ORDER BY sequence DESC LIMIT 1",
        )
        .get(),
    ).toEqual({ entityType: "transaction", entityId: "charge-legacy", operation: "delete" });
  });
});
