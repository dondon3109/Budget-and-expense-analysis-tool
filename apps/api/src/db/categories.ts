import type { CategoryInput, CategoryRecord, CategoryUpdate } from "@zoption/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories } from "../../../../db/schema";
import { customCategoryLimitError, FREE_CUSTOM_CATEGORY_LIMIT } from "./billing";
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

export const categoryRepository: CategoryRepository = {
  async list(env, tenantId, includeArchived = false) {
    const db = drizzle(env.DB);
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        archived: categories.archived,
        systemKey: categories.systemKey,
        origin: categories.origin,
      })
      .from(categories)
      .where(
        includeArchived
          ? eq(categories.tenantId, tenantId)
          : and(eq(categories.tenantId, tenantId), eq(categories.archived, false)),
      )
      .orderBy(asc(categories.kind), asc(categories.name));
    return rows.map(({ systemKey, ...category }) => ({
      ...category,
      system: systemKey !== null,
    }));
  },

  async create(env, tenantId, input) {
    await ensureUniqueName(env, input.name, tenantId);
    const id = crypto.randomUUID();
    let result: D1Result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO categories (id, tenant_id, name, kind, color, origin)
         SELECT ?, ?, ?, ?, ?, 'custom'
         WHERE EXISTS (
           SELECT 1 FROM billing_subscriptions
           WHERE tenant_id = ? AND status IN ('active', 'trialing')
         ) OR (
           SELECT COUNT(*) FROM categories
           WHERE tenant_id = ? AND origin = 'custom' AND archived = 0
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
          FREE_CUSTOM_CATEGORY_LIMIT,
        )
        .run();
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if ((result.meta.changes ?? 0) !== 1) throw await customCategoryLimitError(env, tenantId);
    return { id, ...input, archived: false, system: false, origin: "custom" };
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
             OR EXISTS (
               SELECT 1 FROM billing_subscriptions
               WHERE tenant_id = ? AND status IN ('active', 'trialing')
             )
             OR (
               SELECT COUNT(*) FROM categories
               WHERE tenant_id = ? AND origin = 'custom' AND archived = 0
             ) < ?
           )`,
      )
        .bind(
          nextName,
          nextColor,
          nextArchived ? 1 : 0,
          id,
          tenantId,
          restoringCustom ? 1 : 0,
          tenantId,
          tenantId,
          FREE_CUSTOM_CATEGORY_LIMIT,
        )
        .run();
    } catch (error) {
      rethrowCategoryWriteError(error);
    }
    if ((result.meta.changes ?? 0) !== 1) throw await customCategoryLimitError(env, tenantId);

    return {
      id: existing.id,
      name: nextName,
      kind: existing.kind,
      color: nextColor,
      archived: nextArchived,
      system: false,
      origin: existing.origin,
    };
  },
};
