import { afterEach, describe, expect, it, vi } from "vitest";

import { accountRepository } from "../src/db/accounts";
import { subscriptionRepository } from "../src/db/subscriptions";
import { createSubscriptionRenewalService } from "../src/subscriptions/renewals";
import type { Bindings, EmailSender } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: Array<{ close(): void }> = [];

afterEach(() => {
  vi.useRealTimers();
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

function renewalEnvironment(): ReturnType<typeof seededEnvironment> {
  const seeded = seededEnvironment();
  return {
    ...seeded,
    env: {
      ...seeded.env,
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      WEB_APP_URL: "https://app.zoption.site",
      EMAIL_FROM: "hello@zoption.site",
    },
  };
}

function recipientFetcher(email = "don@example.com") {
  return vi.fn(
    async () => new Response(JSON.stringify({ id: "user-1", email }), { status: 200 }),
  ) as unknown as typeof fetch;
}

function dueSubscription(
  database: ReturnType<typeof seededEnvironment>["database"],
  amountMinor: number,
) {
  database.exec(`
    INSERT INTO user_tenants (user_id, tenant_id) VALUES ('user-1', 'tenant-1');
    INSERT INTO subscriptions (
      id, tenant_id, account_id, category_id, name, amount_minor, currency,
      billing_cycle, next_billing_date, status
    ) VALUES (
      'subscription-1', 'tenant-1', 'account-1', 'category-1', 'Rent', ${amountMinor},
      'PHP', 'monthly', '2026-09-25', 'active'
    );
  `);
}

describe("subscription renewals", () => {
  it("names the active subscriptions paid from an account so removing it can warn", async () => {
    const { env, database } = renewalEnvironment();
    dueSubscription(database, 20_000);
    database.exec(`
      INSERT INTO subscriptions (
        id, tenant_id, account_id, category_id, name, amount_minor, currency,
        billing_cycle, next_billing_date, status
      ) VALUES (
        'subscription-2', 'tenant-1', 'account-1', 'category-1', 'Old plan', 5000,
        'PHP', 'monthly', '2026-09-25', 'canceled'
      );
    `);

    const accounts = await accountRepository.list(env, "tenant-1");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.activeSubscriptions).toEqual(["Rent"]);
  });

  it("posts the next cycle charge and rolls the billing date forward on the due date", async () => {
    const { env, database } = renewalEnvironment();
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
    const service = createSubscriptionRenewalService(subscriptionRepository, {
      sender: { send: async () => undefined },
      fetcher: recipientFetcher(),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T00:30:00+08:00"));

    // Creating the subscription already recorded the September charge, so the due date rolls
    // forward without a second charge for the same cycle.
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ checked: 1, rolled: 1 });
    expect(
      database
        .prepare("SELECT next_billing_date AS date FROM subscriptions WHERE id = ?")
        .get(subscriptionId),
    ).toEqual({ date: "2026-10-25" });
    expect(database.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 2,
    });

    // The October due date records its own charge and rolls the schedule on again.
    vi.setSystemTime(new Date("2026-10-25T07:00:00+08:00"));
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ checked: 1, charged: 1 });
    expect(
      database
        .prepare("SELECT next_billing_date AS date FROM subscriptions WHERE id = ?")
        .get(subscriptionId),
    ).toEqual({ date: "2026-11-25" });
    expect(database.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 3,
    });
    // A linked charge only ever means "the upcoming charge", so edits cannot rewrite history.
    expect(
      database
        .prepare("SELECT count(*) AS count FROM transactions WHERE subscription_id IS NOT NULL")
        .get(),
    ).toEqual({ count: 0 });
    await expect(accountRepository.list(env, "tenant-1")).resolves.toMatchObject([
      { id: "account-1", balanceMinor: 60_200 },
    ]);
  });

  it("does not charge a cycle twice when a stale edit restores an already billed date", async () => {
    const { env, database } = renewalEnvironment();
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
    const service = createSubscriptionRenewalService(subscriptionRepository, {
      sender: { send: async () => undefined },
      fetcher: recipientFetcher(),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T09:00:00+08:00"));
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ rolled: 1 });

    // An editor opened before the roll resubmits the billing date it loaded, which the sweep
    // has already billed and released.
    await subscriptionRepository.update(env, "tenant-1", subscriptionId, {
      name: "Music streaming",
      amountMinor: 19_900,
      billingCycle: "monthly",
      nextBillingDate: "2026-09-25",
      categoryId: "category-1",
      accountId: "account-1",
    });

    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ charged: 0, rolled: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 2,
    });

    // The schedule still advances and bills its next cycle normally.
    vi.setSystemTime(new Date("2026-10-25T09:00:00+08:00"));
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ charged: 1 });
    expect(database.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 3,
    });
  });

  it("keeps the due date and emails once when the account cannot cover the charge", async () => {
    const { env, database } = renewalEnvironment();
    dueSubscription(database, 150_000);
    const sent: Array<Parameters<EmailSender["send"]>[0]> = [];
    const service = createSubscriptionRenewalService(subscriptionRepository, {
      sender: { send: async (message) => void sent.push(message) },
      fetcher: recipientFetcher(),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T08:00:00+08:00"));

    await expect(service.runDueRenewals(env)).resolves.toMatchObject({
      uncovered: 1,
      notified: 1,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "don@example.com",
      from: { email: "hello@zoption.site", name: "Zoption" },
      subject: "Your Rent subscription could not be renewed",
    });
    expect(sent[0]?.text).toContain("PHP 1,500.00");
    // The app reads this to say why the cycle is held back, so it has to be recorded.
    expect(
      database
        .prepare(
          "SELECT renewal_blocked_reason AS reason FROM subscriptions WHERE id = 'subscription-1'",
        )
        .get(),
    ).toEqual({ reason: "insufficient_balance" });

    // The retry the next run makes stays silent, and the due date is untouched.
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({
      uncovered: 1,
      notified: 0,
    });
    expect(sent).toHaveLength(1);
    expect(
      database
        .prepare("SELECT next_billing_date AS date FROM subscriptions WHERE id = 'subscription-1'")
        .get(),
    ).toEqual({ date: "2026-09-25" });

    // Once the account can cover it, the charge is recorded and the schedule moves on.
    database.exec(
      `INSERT INTO transactions (
         id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
       ) VALUES ('top-up', 'tenant-1', 'account-1', 'category-1', '2026-09-25', 'Top up', 100000, 'PHP', 'income')`,
    );
    await expect(service.runDueRenewals(env)).resolves.toMatchObject({ charged: 1, uncovered: 0 });
    // Settling the cycle clears the blocked state.
    expect(
      database
        .prepare(
          "SELECT renewal_blocked_reason AS reason FROM subscriptions WHERE id = 'subscription-1'",
        )
        .get(),
    ).toEqual({ reason: null });
    expect(
      database
        .prepare("SELECT next_billing_date AS date FROM subscriptions WHERE id = 'subscription-1'")
        .get(),
    ).toEqual({ date: "2026-10-25" });
  });

  it("skips the charge and says so when the paying account was removed", async () => {
    const { env, database } = renewalEnvironment();
    // The balance comfortably covers the charge, so only the removed account holds it back.
    dueSubscription(database, 20_000);
    database.exec("UPDATE accounts SET archived = 1 WHERE id = 'account-1'");
    const sent: Array<Parameters<EmailSender["send"]>[0]> = [];
    const service = createSubscriptionRenewalService(subscriptionRepository, {
      sender: { send: async (message) => void sent.push(message) },
      fetcher: recipientFetcher(),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T08:00:00+08:00"));

    await expect(service.runDueRenewals(env)).resolves.toMatchObject({
      archived: 1,
      uncovered: 0,
      notified: 1,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("Your Rent subscription needs a different account");
    expect(sent[0]?.text).toContain("was removed from your accounts");
    expect(database.prepare("SELECT count(*) AS count FROM transactions").get()).toEqual({
      count: 1,
    });
    expect(
      database.prepare("SELECT status, reason FROM subscription_renewal_notifications").get(),
    ).toEqual({ status: "sent", reason: "account_archived" });
    expect(
      database
        .prepare(
          "SELECT renewal_blocked_reason AS reason FROM subscriptions WHERE id = 'subscription-1'",
        )
        .get(),
    ).toEqual({ reason: "account_archived" });
    // And the subscriptions list surfaces it, which is what the app renders.
    const listed = await subscriptionRepository.list(env, "tenant-1", "2026-09-01");
    expect(listed.items[0]?.renewalBlockedReason).toBe("account_archived");
    expect(
      database
        .prepare("SELECT next_billing_date AS date FROM subscriptions WHERE id = 'subscription-1'")
        .get(),
    ).toEqual({ date: "2026-09-25" });
  });

  it("retries a notification whose delivery failed once its lease expires", async () => {
    const { env, database } = renewalEnvironment();
    dueSubscription(database, 150_000);
    let unavailable = true;
    const service = createSubscriptionRenewalService(subscriptionRepository, {
      sender: {
        send: async () => {
          if (unavailable) throw new Error("resend unavailable");
        },
      },
      fetcher: recipientFetcher(),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T08:00:00+08:00"));
    await service.runDueRenewals(env);
    expect(
      database
        .prepare(
          "SELECT status, attempts, last_error_code AS errorCode FROM subscription_renewal_notifications",
        )
        .get(),
    ).toEqual({ status: "failed", attempts: 1, errorCode: "email_delivery_failed" });

    // A failed delivery releases the lease, so the next cron pass retries it.
    unavailable = false;
    await expect(service.retryPendingNotifications(env, 10)).resolves.toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    expect(database.prepare("SELECT status FROM subscription_renewal_notifications").get()).toEqual(
      { status: "sent" },
    );
  });
});
