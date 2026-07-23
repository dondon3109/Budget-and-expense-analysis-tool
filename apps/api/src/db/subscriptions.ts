import {
  monthlySubscriptionCost,
  subscriptionBillingDateForMonth,
  type SubscriptionInput,
  type SubscriptionMonthSummary,
  type SubscriptionRecord,
  type SubscriptionStatusUpdate,
} from "@zoption/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories, subscriptions } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface SubscriptionRepository {
  list(env: Bindings, tenantId: string, month: string): Promise<SubscriptionMonthSummary>;
  create(env: Bindings, tenantId: string, input: SubscriptionInput): Promise<SubscriptionRecord>;
  setStatus(
    env: Bindings,
    tenantId: string,
    id: string,
    input: SubscriptionStatusUpdate,
  ): Promise<SubscriptionRecord>;
}

async function validateCategory(env: Bindings, tenantId: string, categoryId: string) {
  const db = drizzle(env.DB);
  const [category] = await db
    .select({ kind: categories.kind, archived: categories.archived })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!category || category.archived || category.kind !== "expense") {
    throw new HttpError(400, "invalid_subscription_category", "Choose an active expense category.");
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
    })
    .from(subscriptions)
    .innerJoin(
      categories,
      and(eq(subscriptions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
    )
    .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
    .limit(1);

  return row ? { ...row, currency: "PHP" } : null;
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
      })
      .from(subscriptions)
      .innerJoin(
        categories,
        and(eq(subscriptions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
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
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    await db.insert(subscriptions).values({
      id,
      tenantId,
      categoryId: input.categoryId,
      name: input.name,
      amountMinor: input.amountMinor,
      currency: "PHP",
      billingCycle: input.billingCycle,
      nextBillingDate: input.nextBillingDate,
      status: "active",
    });

    const created = await findSubscription(env, tenantId, id);
    if (!created) throw new Error("Created subscription could not be read back.");
    return created;
  },

  async setStatus(env, tenantId, id, input) {
    const existing = await findSubscription(env, tenantId, id);
    if (!existing) {
      throw new HttpError(404, "subscription_not_found", "Subscription not found.");
    }

    const db = drizzle(env.DB);
    await db
      .update(subscriptions)
      .set({ status: input.status, updatedAt: sql`(datetime('now'))` })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)));

    const updated = await findSubscription(env, tenantId, id);
    if (!updated) throw new Error("Updated subscription could not be read back.");
    return updated;
  },
};
