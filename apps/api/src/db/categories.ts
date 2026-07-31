import type { CategoryInput, CategoryRecord, CategoryUpdate } from "@zoption/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories } from "../../../../db/schema";
import {
  EFFECTIVE_PRO_SUBSCRIPTION_CONDITION,
  customCategoryLimitError,
  FREE_CUSTOM_CATEGORY_LIMIT,
  hasProEntitlement,
} from "./billing";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface CategoryRepository {
  list(env: Bindings, tenantId: string, includeArchived?: boolean): Promise<CategoryRecord[]>;
  create(env: Bindings, tenantId: string, input: CategoryInput): Promise<CategoryRecord>;
  update(
    env: Bindings,
    tenantId: string,
    id: string,
    input: CategoryUpdate,
  ): Promise<CategoryRecord>;
}

async function ensureUniqueName(env: Bindings, name: string, tenantId: string, exceptId?: string) {
  const db = drizzle(env.DB);
  const conditions = [
    eq(categories.tenantId, tenantId),
    sql`lower(${categories.name}) = lower(${name})`,
  ];
  if (exceptId) conditions.push(ne(categories.id, exceptId));
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw new HttpError(409, "category_name_exists", "A category with this name already exists.");
  }
}

function rethrowCategoryWriteError(error: unknown): never {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("unique constraint failed") &&
    message.includes("categories.tenant_id") &&
    message.includes("categories.name")
  ) {
    throw new HttpError(409, "category_name_exists", "A category with this name already exists.");
  }
  throw error;
}

function toCategoryRecord(
  category: Omit<CategoryRecord, "system" | "locked"> & { systemKey: string | null },
  hasPro: boolean,
): CategoryRecord {
  const { systemKey, ...record } = category;
  return {
    ...record,
    system: systemKey !== null,
    locked: record.requiredPlan === "zoption_pro" && !hasPro,
  };
}

export const categoryRepository: CategoryRepository = {
  async list(env, tenantId, includeArchived = false) {
    const db = drizzle(env.DB);
    const [rows, hasPro] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          color: categories.color,
          archived: categories.archived,
          systemKey: categories.systemKey,
          origin: categories.origin,
          requiredPlan: categories.requiredPlan,
        })
        .from(categories)
        .where(
          includeArchived
            ? eq(categories.tenantId, tenantId)
            : and(eq(categories.tenantId, tenantId), eq(categories.archived, false)),
        )
        .orderBy(asc(categories.kind), asc(categories.name)),
      hasProEntitlement(env, tenantId),
    ]);
    return rows.map((category) => toCategoryRecord(category, hasPro));
  },

  async create(env, tenantId, input) {
    const db = drizzle(env.DB);
    await ensureUniqueName(env, input.name, tenantId);
    const id = crypto.randomUUID();
    let result: D1Result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO categories (id, tenant_id, name, kind, color, origin, required_plan)
         SELECT ?, ?, ?, ?, ?, 'custom',
           CASE WHEN EXISTS (
             SELECT 1 FROM billing_subscriptions
             WHERE tenant_id = ? AND ${EFFECTIVE_PRO_SUBSCRIPTION_CONDITION}
           ) THEN 'zoption_pro' ELSE 'free' END
         WHERE EXISTS (
           SELECT 1 FROM billing_subscriptions
           WHERE tenant_id = ? AND ${EFFECTIVE_PRO_SUBSCRIPTION_CONDITION}
         ) OR (
           SELECT COUNT(*) FROM categories
           WHERE tenant_id = ? AND origin = 'custom' AND required_plan = 'free' AND archived = 0
         ) < ?`,
      )
        .bind(
          id,
          tenantId,
          input.name,
          input.kind,
          input.color,
          tenantId,
          tenantId,
          tenantId,
          FREE_CUSTOM_CATEGORY_LIMIT,
        )
        .run();
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if ((result.meta.changes ?? 0) !== 1) throw await customCategoryLimitError(env, tenantId);
    const [created, hasPro] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          color: categories.color,
          archived: categories.archived,
          systemKey: categories.systemKey,
          origin: categories.origin,
          requiredPlan: categories.requiredPlan,
        })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
        .limit(1)
        .then((rows) => rows[0]),
      hasProEntitlement(env, tenantId),
    ]);
    if (!created) throw new Error("Created category could not be read back.");
    return toCategoryRecord(created, hasPro);
  },

  async update(env, tenantId, id, input) {
    const db = drizzle(env.DB);
    const [existing] = await db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        archived: categories.archived,
        systemKey: categories.systemKey,
        origin: categories.origin,
        requiredPlan: categories.requiredPlan,
      })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);
    if (!existing) throw new HttpError(404, "category_not_found", "Category not found.");
    if (existing.systemKey) {
      throw new HttpError(
        409,
        "system_category_protected",
        "Uncategorized categories are required for imports and cannot be changed.",
      );
    }
    if (input.name) await ensureUniqueName(env, input.name, tenantId, id);

    const nextName = input.name ?? existing.name;
    const nextColor = input.color ?? existing.color;
    const nextArchived = input.archived ?? existing.archived;
    const restoringCustom =
      existing.origin === "custom" && existing.archived && input.archived === false;

    let result: D1Result;
    try {
      result = await env.DB.prepare(
        `UPDATE categories
         SET name = ?, color = ?, archived = ?, updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?
           AND (
             ? = 0
             OR (
               ? = 'zoption_pro'
               AND EXISTS (
                 SELECT 1 FROM billing_subscriptions
                 WHERE tenant_id = ? AND ${EFFECTIVE_PRO_SUBSCRIPTION_CONDITION}
               )
             )
             OR (
               ? = 'free'
               AND (
                 SELECT COUNT(*) FROM categories
                 WHERE tenant_id = ? AND origin = 'custom' AND required_plan = 'free' AND archived = 0
               ) < ?
             )
           )`,
      )
        .bind(
          nextName,
          nextColor,
          nextArchived ? 1 : 0,
          id,
          tenantId,
          restoringCustom ? 1 : 0,
          existing.requiredPlan,
          tenantId,
          existing.requiredPlan,
          tenantId,
          FREE_CUSTOM_CATEGORY_LIMIT,
        )
        .run();
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if ((result.meta.changes ?? 0) !== 1) {
      if (restoringCustom && existing.requiredPlan === "zoption_pro") {
        throw new HttpError(
          403,
          "category_requires_pro",
          "Restore this category with an active Zoption Pro subscription.",
          { requiredPlan: "zoption_pro", billingPath: "/app/settings" },
        );
      }
      throw await customCategoryLimitError(env, tenantId);
    }

    return toCategoryRecord(
      {
        id: existing.id,
        name: nextName,
        kind: existing.kind,
        color: nextColor,
        archived: nextArchived,
        systemKey: existing.systemKey,
        origin: existing.origin,
        requiredPlan: existing.requiredPlan,
      },
      await hasProEntitlement(env, tenantId),
    );
  },
};
