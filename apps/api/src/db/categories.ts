import type { CategoryInput, CategoryRecord, CategoryUpdate } from "@zoption/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories } from "../../../../db/schema";
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
    const db = drizzle(env.DB);
    await db.insert(categories).values({ id, tenantId, ...input });
    return { id, ...input, archived: false, system: false };
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

    await db
      .update(categories)
      .set({ ...input, updatedAt: sql`(datetime('now'))` })
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));
    return {
      id: existing.id,
      name: input.name ?? existing.name,
      kind: existing.kind,
      color: input.color ?? existing.color,
      archived: input.archived ?? existing.archived,
      system: false,
    };
  },
};
