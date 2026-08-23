import {
  monthlySubscriptionCost,
  normalizeSignedAmount,
  subscriptionBillingDateForMonth,
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
};
