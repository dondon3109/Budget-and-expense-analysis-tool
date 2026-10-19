import type { BillingTier, CategoryInput, CategoryRecord, CategoryUpdate } from "@zoption/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories } from "../../../../db/schema";
import {
  categoryPlanRankSql,
  EFFECTIVE_TIER_RANK_SQL,
  isCategoryPlanAvailable,
  NEXT_CUSTOM_CATEGORY_PLAN_SQL,
  readTier,
  wireCategoryPlan,
} from "../billing/entitlements";
import { customCategoryLimitError } from "./billing-usage";
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
  category: Omit<CategoryRecord, "system" | "locked" | "systemKey" | "requiredPlan"> & {
    systemKey: string | null;
    requiredPlan: string;
  },
  tier: BillingTier,
): CategoryRecord {
  const { systemKey, requiredPlan, ...record } = category;
  return {
    ...record,
    requiredPlan: wireCategoryPlan(requiredPlan),
    systemKey,
    system: systemKey !== null,
    locked: !isCategoryPlanAvailable(requiredPlan, tier),
  };
}

/** The new tag may only be one the tenant's tier covers. Binds the tenant id three times. */
const NEXT_PLAN_FITS_TIER_SQL = `${categoryPlanRankSql(
  `(${NEXT_CUSTOM_CATEGORY_PLAN_SQL})`,
)} <= ${EFFECTIVE_TIER_RANK_SQL}`;

export const categoryRepository: CategoryRepository = {
  async list(env, tenantId, includeArchived = false) {
    const db = drizzle(env.DB);
    const [rows, tier] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          color: categories.color,
          iconEmoji: categories.iconEmoji,
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
      readTier(env, tenantId),
    ]);
    return rows.map((category) => toCategoryRecord(category, tier));
  },

  async create(env, tenantId, input) {
    const db = drizzle(env.DB);
    await ensureUniqueName(env, input.name, tenantId);
    const id = crypto.randomUUID();
    let createdId: string | null;
    try {
      createdId = await env.DB.prepare(
        `INSERT INTO categories (id, tenant_id, name, kind, color, icon_emoji, origin, required_plan)
         SELECT ?, ?, ?, ?, ?, ?, 'custom', ${NEXT_CUSTOM_CATEGORY_PLAN_SQL}
         WHERE ${NEXT_PLAN_FITS_TIER_SQL}
         RETURNING id`,
      )
        .bind(
          id,
          tenantId,
          input.name,
          input.kind,
          input.color,
          input.iconEmoji ?? null,
          tenantId,
          tenantId,
          tenantId,
          tenantId,
          tenantId,
        )
        .first<string>("id");
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if (!createdId) throw await customCategoryLimitError(env, tenantId);
    const [created, tier] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
          color: categories.color,
          iconEmoji: categories.iconEmoji,
          archived: categories.archived,
          systemKey: categories.systemKey,
          origin: categories.origin,
          requiredPlan: categories.requiredPlan,
        })
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
        .limit(1)
        .then((rows) => rows[0]),
      readTier(env, tenantId),
    ]);
    if (!created) throw new Error("Created category could not be read back.");
    return toCategoryRecord(created, tier);
  },

  async update(env, tenantId, id, input) {
    const db = drizzle(env.DB);
    const [existing] = await db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        iconEmoji: categories.iconEmoji,
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
    const nextIconEmoji = input.iconEmoji !== undefined ? input.iconEmoji : existing.iconEmoji;
    const nextArchived = input.archived ?? existing.archived;
    const restoringCustom =
      existing.origin === "custom" && existing.archived && input.archived === false;

    // Restoring a custom category takes a fresh slot, like creating one, so it is tagged with
    // the lowest tier that still has room and must fit the tenant's tier.
    let updated: { id: string; requiredPlan: string } | null;
    try {
      updated = await env.DB.prepare(
        `UPDATE categories
         SET name = ?, color = ?, icon_emoji = ?, archived = ?, updated_at = datetime('now'),
             required_plan = CASE WHEN ? = 1 THEN ${NEXT_CUSTOM_CATEGORY_PLAN_SQL}
               ELSE required_plan END
         WHERE id = ? AND tenant_id = ?
           AND (? = 0 OR ${NEXT_PLAN_FITS_TIER_SQL})
         RETURNING id, required_plan AS requiredPlan`,
      )
        .bind(
          nextName,
          nextColor,
          nextIconEmoji,
          nextArchived ? 1 : 0,
          restoringCustom ? 1 : 0,
          tenantId,
          tenantId,
          id,
          tenantId,
          restoringCustom ? 1 : 0,
          tenantId,
          tenantId,
          tenantId,
        )
        .first<{ id: string; requiredPlan: string }>();
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if (!updated) throw await customCategoryLimitError(env, tenantId);

    return toCategoryRecord(
      {
        id: existing.id,
        name: nextName,
        kind: existing.kind,
        color: nextColor,
        iconEmoji: nextIconEmoji,
        archived: nextArchived,
        systemKey: existing.systemKey,
        origin: existing.origin,
        requiredPlan: updated.requiredPlan,
      },
      await readTier(env, tenantId),
    );
  },
};
