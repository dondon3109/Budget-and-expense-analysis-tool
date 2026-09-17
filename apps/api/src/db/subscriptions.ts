import {
  monthlySubscriptionCost,
  normalizeSignedAmount,
  subscriptionBillingDateForMonth,
  type SubscriptionBillingCycle,
  type SubscriptionInput,
  type SubscriptionMonthSummary,
  type SubscriptionRecord,
  type SubscriptionStatusUpdate,
  type SubscriptionUpdate,
} from "@zoption/shared";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, categories, subscriptions } from "../../../../db/schema";
import { categoryRequiresProError, hasProEntitlement, isCategoryPlanAvailable } from "./billing";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface SubscriptionRepository {
  list(env: Bindings, tenantId: string, month: string): Promise<SubscriptionMonthSummary>;
  create(env: Bindings, tenantId: string, input: SubscriptionInput): Promise<SubscriptionRecord>;
  update(
    env: Bindings,
    tenantId: string,
    id: string,
    input: SubscriptionUpdate,
  ): Promise<SubscriptionRecord>;
  setStatus(
    env: Bindings,
    tenantId: string,
    id: string,
    input: SubscriptionStatusUpdate,
  ): Promise<SubscriptionRecord>;
  remove(env: Bindings, tenantId: string, id: string): Promise<void>;
  listDueRenewals(env: Bindings, dueDate: string, limit: number): Promise<DueSubscriptionRenewal[]>;
  postRenewalCharge(
    env: Bindings,
    renewal: DueSubscriptionRenewal,
    nextBillingDate: string,
  ): Promise<boolean>;
  advanceRenewalSchedule(
    env: Bindings,
    renewal: DueSubscriptionRenewal,
    nextBillingDate: string,
  ): Promise<boolean>;
  createRenewalNotification(
    env: Bindings,
    notice: SubscriptionRenewalNotification,
  ): Promise<boolean>;
  claimRenewalNotification(
    env: Bindings,
    id: string,
  ): Promise<SubscriptionRenewalNotification | null>;
  claimPendingRenewalNotifications(
    env: Bindings,
    limit: number,
  ): Promise<SubscriptionRenewalNotification[]>;
  finishRenewalNotification(
    env: Bindings,
    id: string,
    status: "sent" | "failed",
    errorCode: string | null,
  ): Promise<void>;
}

interface LinkedSubscriptionCharge {
  id: string;
  tenantId: string;
  accountId: string;
  categoryId: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: "PHP";
  kind: "expense";
  sourceKind: "manual";
  subscriptionId: string;
}

function buildLinkedSubscriptionCharge(args: {
  tenantId: string;
  subscriptionId: string;
  accountId: string;
  categoryId: string;
  name: string;
  amountMinor: number;
  nextBillingDate: string;
}): LinkedSubscriptionCharge {
  return {
    id: crypto.randomUUID(),
    tenantId: args.tenantId,
    accountId: args.accountId,
    categoryId: args.categoryId,
    date: args.nextBillingDate,
    description: args.name,
    amountMinor: normalizeSignedAmount(args.amountMinor, "expense"),
    currency: "PHP",
    kind: "expense",
    sourceKind: "manual",
    subscriptionId: args.subscriptionId,
  };
}

function insertLinkedChargeStatement(env: Bindings, charge: LinkedSubscriptionCharge) {
  return env.DB.prepare(
    `INSERT INTO transactions (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, source_kind, subscription_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'expense', 'manual', ?)`,
  ).bind(
    charge.id,
    charge.tenantId,
    charge.accountId,
    charge.categoryId,
    charge.date,
    charge.description,
    charge.amountMinor,
    charge.currency,
    charge.subscriptionId,
  );
}

function updateLinkedChargeStatement(
  env: Bindings,
  tenantId: string,
  subscriptionId: string,
  input: {
    accountId: string;
    categoryId: string;
    name: string;
    amountMinor: number;
    nextBillingDate: string;
  },
) {
  return env.DB.prepare(
    `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?, currency = 'PHP', kind = 'expense', updated_at = datetime('now') WHERE tenant_id = ? AND subscription_id = ?`,
  ).bind(
    input.accountId,
    input.categoryId,
    input.nextBillingDate,
    input.name,
    normalizeSignedAmount(input.amountMinor, "expense"),
    tenantId,
    subscriptionId,
  );
}

async function findLinkedChargeId(
  env: Bindings,
  tenantId: string,
  subscriptionId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT id FROM transactions WHERE tenant_id = ? AND subscription_id = ? LIMIT 1",
  )
    .bind(tenantId, subscriptionId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function validateCategory(env: Bindings, tenantId: string, categoryId: string) {
  const db = drizzle(env.DB);
  const [category] = await db
    .select({
      kind: categories.kind,
      archived: categories.archived,
      requiredPlan: categories.requiredPlan,
    })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!category || category.archived || category.kind !== "expense") {
    throw new HttpError(400, "invalid_subscription_category", "Choose an active expense category.");
  }
  if (!isCategoryPlanAvailable(category.requiredPlan, await hasProEntitlement(env, tenantId))) {
    throw categoryRequiresProError();
  }
}

async function validateAccount(env: Bindings, tenantId: string, accountId: string) {
  const db = drizzle(env.DB);
  const [account] = await db
    .select({ id: accounts.id, archived: accounts.archived })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
    .limit(1);

  if (!account || account.archived) {
    throw new HttpError(400, "invalid_account", "Choose an active account.");
  }
}

async function findSubscription(
  env: Bindings,
  tenantId: string,
  id: string,
): Promise<SubscriptionRecord | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amountMinor: subscriptions.amountMinor,
      currency: subscriptions.currency,
      billingCycle: subscriptions.billingCycle,
      nextBillingDate: subscriptions.nextBillingDate,
      status: subscriptions.status,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(subscriptions)
    .innerJoin(
      categories,
      and(eq(subscriptions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
    )
    .leftJoin(
      accounts,
      and(eq(subscriptions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
    )
    .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
    .limit(1);

  return row
    ? {
        ...row,
        currency: "PHP",
        accountId: row.accountId ?? null,
        accountName: row.accountName ?? null,
      }
    : null;
}

export interface DueSubscriptionRenewal {
  id: string;
  tenantId: string;
  accountId: string;
  accountName: string;
  categoryId: string;
  name: string;
  billingCycle: SubscriptionBillingCycle;
  amountMinor: number;
  nextBillingDate: string;
  /** The linked account balance, summed the same way the accounts screen sums it. */
  balanceMinor: number;
  /** True when the due date already has a charge, leaving only the roll forward to do. */
  charged: boolean;
}

export interface SubscriptionRenewalNotification {
  id: string;
  tenantId: string;
  subscriptionId: string;
  dueDate: string;
  subscriptionName: string;
  amountMinor: number;
  accountName: string | null;
}

const NOTIFICATION_ATTEMPT_LIMIT = 8;

function notificationLease(): string {
  return new Date(Date.now() + 10 * 60 * 1_000).toISOString();
}

/**
 * Moves the schedule forward only while the row still matches the due date the sweep read, so a
 * concurrent edit in the subscription editor cannot be rolled back by a scheduled charge.
 */
function advanceScheduleStatement(
  env: Bindings,
  renewal: DueSubscriptionRenewal,
  nextBillingDate: string,
) {
  return env.DB.prepare(
    `UPDATE subscriptions SET next_billing_date = ?, updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND status = 'active' AND next_billing_date = ?`,
  ).bind(nextBillingDate, renewal.id, renewal.tenantId, renewal.nextBillingDate);
}

/**
 * Releases charges whose cycle has already been billed. A linked charge only ever means "the
 * upcoming charge", so later edits keep rewriting the current one instead of past history.
 */
function releaseSettledChargesStatement(env: Bindings, renewal: DueSubscriptionRenewal) {
  return env.DB.prepare(
    `UPDATE transactions SET subscription_id = NULL, updated_at = datetime('now')
     WHERE tenant_id = ? AND subscription_id = ?
       AND date < (SELECT next_billing_date FROM subscriptions WHERE id = ? AND tenant_id = ?)`,
  ).bind(renewal.tenantId, renewal.id, renewal.id, renewal.tenantId);
}

async function findRenewalNotification(
  env: Bindings,
  id: string,
): Promise<SubscriptionRenewalNotification | null> {
  return env.DB.prepare(
    `SELECT id, tenant_id AS tenantId, subscription_id AS subscriptionId, due_date AS dueDate,
            subscription_name AS subscriptionName, amount_minor AS amountMinor,
            account_name AS accountName
     FROM subscription_renewal_notifications WHERE id = ?`,
  )
    .bind(id)
    .first<SubscriptionRenewalNotification>();
}

export const subscriptionRepository: SubscriptionRepository = {
  async list(env, tenantId, month) {
    const db = drizzle(env.DB);
    const rows = await db
      .select({
        id: subscriptions.id,
        name: subscriptions.name,
        amountMinor: subscriptions.amountMinor,
        currency: subscriptions.currency,
        billingCycle: subscriptions.billingCycle,
        nextBillingDate: subscriptions.nextBillingDate,
        status: subscriptions.status,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryColor: categories.color,
        accountId: accounts.id,
        accountName: accounts.name,
      })
      .from(subscriptions)
      .innerJoin(
        categories,
        and(eq(subscriptions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
      )
      .leftJoin(
        accounts,
        and(eq(subscriptions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
      )
      .where(eq(subscriptions.tenantId, tenantId))
      .orderBy(asc(subscriptions.name), asc(subscriptions.id));

    const items = rows
      .map((row) => {
        const monthlyCostMinor = monthlySubscriptionCost(row.amountMinor, row.billingCycle);
        return {
          ...row,
          currency: "PHP" as const,
          billingDate: subscriptionBillingDateForMonth(
            row.nextBillingDate,
            row.billingCycle,
            month,
          ),
          monthlyCostMinor,
        };
      })
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "active" ? -1 : 1;
        return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
      });

    return {
      month,
      currency: "PHP",
      totalMonthlyCostMinor: items.reduce(
        (total, item) => total + (item.status === "active" ? item.monthlyCostMinor : 0),
        0,
      ),
      items,
    };
  },

  async create(env, tenantId, input) {
    await validateCategory(env, tenantId, input.categoryId);
    await validateAccount(env, tenantId, input.accountId);
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO subscriptions (id, tenant_id, account_id, category_id, name, amount_minor, currency, billing_cycle, next_billing_date, status) VALUES (?, ?, ?, ?, ?, ?, 'PHP', ?, ?, 'active')`,
      ).bind(
        id,
        tenantId,
        input.accountId,
        input.categoryId,
        input.name,
        input.amountMinor,
        input.billingCycle,
        input.nextBillingDate,
      ),
      insertLinkedChargeStatement(
        env,
        buildLinkedSubscriptionCharge({
          tenantId,
          subscriptionId: id,
          accountId: input.accountId,
          categoryId: input.categoryId,
          name: input.name,
          amountMinor: input.amountMinor,
          nextBillingDate: input.nextBillingDate,
        }),
      ),
    ]);

    const created = await findSubscription(env, tenantId, id);
    if (!created) throw new Error("Created subscription could not be read back.");
    return created;
  },

  async setStatus(env, tenantId, id, input) {
    const existing = await findSubscription(env, tenantId, id);
    if (!existing) {
      throw new HttpError(404, "subscription_not_found", "Subscription not found.");
    }

    await env.DB.prepare(
      "UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
    )
      .bind(input.status, id, tenantId)
      .run();

    const updated = await findSubscription(env, tenantId, id);
    if (!updated) throw new Error("Updated subscription could not be read back.");
    return updated;
  },

  async update(env, tenantId, id, input) {
    const existing = await findSubscription(env, tenantId, id);
    if (!existing) {
      throw new HttpError(404, "subscription_not_found", "Subscription not found.");
    }
    await validateCategory(env, tenantId, input.categoryId);
    await validateAccount(env, tenantId, input.accountId);

    const statements = [
      env.DB.prepare(
        `UPDATE subscriptions SET name = ?, amount_minor = ?, billing_cycle = ?, next_billing_date = ?, account_id = ?, category_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      ).bind(
        input.name,
        input.amountMinor,
        input.billingCycle,
        input.nextBillingDate,
        input.accountId,
        input.categoryId,
        id,
        tenantId,
      ),
    ];
    const linkedChargeId = await findLinkedChargeId(env, tenantId, id);
    if (linkedChargeId) {
      statements.push(updateLinkedChargeStatement(env, tenantId, id, input));
    }
    await env.DB.batch(statements);

    const updated = await findSubscription(env, tenantId, id);
    if (!updated) throw new Error("Updated subscription could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const existing = await findSubscription(env, tenantId, id);
    if (!existing) {
      throw new HttpError(404, "subscription_not_found", "Subscription not found.");
    }
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE transactions SET subscription_id = NULL, updated_at = datetime('now') WHERE tenant_id = ? AND subscription_id = ?",
      ).bind(tenantId, id),
      env.DB.prepare("DELETE FROM subscriptions WHERE id = ? AND tenant_id = ?").bind(id, tenantId),
    ]);
  },

  async listDueRenewals(env, dueDate, limit) {
    const rows = await env.DB.prepare(
      `SELECT s.id, s.tenant_id AS tenantId, s.account_id AS accountId, a.name AS accountName,
              s.category_id AS categoryId, s.name, s.billing_cycle AS billingCycle,
              s.amount_minor AS amountMinor, s.next_billing_date AS nextBillingDate,
              COALESCE((
                SELECT SUM(t.amount_minor) FROM transactions t
                WHERE t.tenant_id = s.tenant_id AND t.account_id = s.account_id
                  AND t.currency = a.currency
                  AND (t.kind != 'transfer' OR t.transfer_group_id IS NOT NULL)
              ), 0) AS balanceMinor,
              EXISTS(
                SELECT 1 FROM transactions c
                WHERE c.tenant_id = s.tenant_id AND c.subscription_id = s.id
                  AND c.date = s.next_billing_date
              ) AS charged
       FROM subscriptions s
       JOIN accounts a ON a.id = s.account_id AND a.tenant_id = s.tenant_id
       WHERE s.status = 'active' AND s.account_id IS NOT NULL
         AND date(s.next_billing_date) <= date(?)
       ORDER BY s.next_billing_date, s.id
       LIMIT ?`,
    )
      .bind(dueDate, Math.max(1, Math.min(200, Math.trunc(limit))))
      .all<Omit<DueSubscriptionRenewal, "charged"> & { charged: number }>();
    return rows.results.map((row) => ({ ...row, charged: Boolean(row.charged) }));
  },

  async postRenewalCharge(env, renewal, nextBillingDate) {
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO transactions (
           id, tenant_id, account_id, category_id, date, description, amount_minor,
           currency, kind, source_kind, subscription_id
         )
         SELECT ?, s.tenant_id, s.account_id, s.category_id, s.next_billing_date, s.name,
                -ABS(s.amount_minor), s.currency, 'expense', 'manual', s.id
         FROM subscriptions s
         WHERE s.id = ? AND s.tenant_id = ? AND s.status = 'active'
           AND s.next_billing_date = ?`,
      ).bind(crypto.randomUUID(), renewal.id, renewal.tenantId, renewal.nextBillingDate),
      advanceScheduleStatement(env, renewal, nextBillingDate),
      releaseSettledChargesStatement(env, renewal),
    ]);
    return (results[1]?.meta.changes ?? 0) === 1;
  },

  async advanceRenewalSchedule(env, renewal, nextBillingDate) {
    const results = await env.DB.batch([
      advanceScheduleStatement(env, renewal, nextBillingDate),
      releaseSettledChargesStatement(env, renewal),
    ]);
    return (results[0]?.meta.changes ?? 0) === 1;
  },

  async createRenewalNotification(env, notice) {
    const result = await env.DB.prepare(
      `INSERT INTO subscription_renewal_notifications
         (id, tenant_id, subscription_id, due_date, subscription_name, amount_minor, account_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (subscription_id, due_date) DO NOTHING`,
    )
      .bind(
        notice.id,
        notice.tenantId,
        notice.subscriptionId,
        notice.dueDate,
        notice.subscriptionName,
        notice.amountMinor,
        notice.accountName,
      )
      .run();
    return (result.meta.changes ?? 0) === 1;
  },

  async claimRenewalNotification(env, id) {
    const result = await env.DB.prepare(
      `UPDATE subscription_renewal_notifications
       SET status = 'pending', attempts = attempts + 1, lease_until = ?,
           last_error_code = NULL, updated_at = datetime('now')
       WHERE id = ? AND status != 'sent' AND attempts < ?
         AND (lease_until IS NULL OR lease_until < ?)`,
    )
      .bind(notificationLease(), id, NOTIFICATION_ATTEMPT_LIMIT, new Date().toISOString())
      .run();
    if ((result.meta.changes ?? 0) === 0) return null;
    return findRenewalNotification(env, id);
  },

  async claimPendingRenewalNotifications(env, limit) {
    const rows = await env.DB.prepare(
      `SELECT id FROM subscription_renewal_notifications
       WHERE status != 'sent' AND attempts < ?
         AND (lease_until IS NULL OR lease_until < ?)
       ORDER BY created_at LIMIT ?`,
    )
      .bind(
        NOTIFICATION_ATTEMPT_LIMIT,
        new Date().toISOString(),
        Math.max(1, Math.min(100, Math.trunc(limit))),
      )
      .all<{ id: string }>();

    const claimed: SubscriptionRenewalNotification[] = [];
    for (const row of rows.results) {
      const notice = await this.claimRenewalNotification(env, row.id);
      if (notice) claimed.push(notice);
    }
    return claimed;
  },

  async finishRenewalNotification(env, id, status, errorCode) {
    await env.DB.prepare(
      `UPDATE subscription_renewal_notifications
       SET status = ?, lease_until = NULL, last_error_code = ?,
           sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(status, errorCode, status, id)
      .run();
  },
};
