import type { CategoryInput, CategoryRecord, CategoryUpdate } from "@budget/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { categories } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { DEMO_TENANT_ID } from "./scope";

export interface CategoryRepository {
  list(env: Bindings, includeArchived?: boolean, tenantId?: string): Promise<CategoryRecord[]>;
  create(env: Bindings, input: CategoryInput, tenantId?: string): Promise<CategoryRecord>;
  update(
    env: Bindings,
    id: string,
    input: CategoryUpdate,
    tenantId?: string,
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
  if (existing)
    throw new HttpError(409, "category_name_exists", "A category with this name already exists.");
}

export const categoryRepository: CategoryRepository = {
  async list(env, includeArchived = false, tenantId = DEMO_TENANT_ID) {
    const db = drizzle(env.DB);
    return db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        archived: categories.archived,
      })
      .from(categories)
      .where(
        includeArchived
          ? eq(categories.tenantId, tenantId)
          : and(eq(categories.tenantId, tenantId), eq(categories.archived, false)),
      )
      .orderBy(asc(categories.kind), asc(categories.name));
  },

  async create(env, input, tenantId = DEMO_TENANT_ID) {
    await ensureUniqueName(env, input.name, tenantId);
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    await db.insert(categories).values({ id, tenantId, ...input });
    return { id, ...input, archived: false };
  },

  async update(env, id, input, tenantId = DEMO_TENANT_ID) {
    const db = drizzle(env.DB);
    const [existing] = await db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        color: categories.color,
        archived: categories.archived,
      })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
      .limit(1);
    if (!existing) throw new HttpError(404, "category_not_found", "Category not found.");
    if (input.name) await ensureUniqueName(env, input.name, tenantId, id);

    await db
      .update(categories)
      .set({ ...input, updatedAt: sql`(datetime('now'))` })
      .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));
    return { ...existing, ...input };
  },
};
