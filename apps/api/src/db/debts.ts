import type { Debt, DebtInput, DebtUpdate } from "@zoption/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { debts } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface DebtRepository {
  list(env: Bindings, tenantId: string): Promise<Debt[]>;
  create(env: Bindings, tenantId: string, input: DebtInput): Promise<Debt>;
  update(env: Bindings, tenantId: string, id: string, input: DebtUpdate): Promise<Debt>;
  remove(env: Bindings, tenantId: string, id: string): Promise<void>;
}

async function findDebt(env: Bindings, tenantId: string, id: string): Promise<Debt | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({
      id: debts.id,
      name: debts.name,
      type: debts.type,
      balanceMinor: debts.balanceMinor,
      aprBasisPoints: debts.aprBasisPoints,
      minimumPaymentMinor: debts.minimumPaymentMinor,
      balanceAsOf: debts.balanceAsOf,
      status: debts.status,
      createdAt: debts.createdAt,
      updatedAt: debts.updatedAt,
    })
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export const debtRepository: DebtRepository = {
  async list(env, tenantId) {
    const db = drizzle(env.DB);
    return db
      .select({
        id: debts.id,
        name: debts.name,
        type: debts.type,
        balanceMinor: debts.balanceMinor,
        aprBasisPoints: debts.aprBasisPoints,
        minimumPaymentMinor: debts.minimumPaymentMinor,
        balanceAsOf: debts.balanceAsOf,
        status: debts.status,
        createdAt: debts.createdAt,
        updatedAt: debts.updatedAt,
      })
      .from(debts)
      .where(eq(debts.tenantId, tenantId))
      .orderBy(asc(debts.status), asc(debts.name));
  },

  async create(env, tenantId, input) {
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    try {
      await db.insert(debts).values({ id, tenantId, ...input });
    } catch (error) {
      if (error instanceof Error && error.message.toLocaleLowerCase("en").includes("unique")) {
        throw new HttpError(409, "debt_exists", "A debt with that name already exists.");
      }
      throw error;
    }
    const created = await findDebt(env, tenantId, id);
    if (!created) throw new Error("Created debt could not be read back.");
    return created;
  },

  async update(env, tenantId, id, input) {
    const existing = await findDebt(env, tenantId, id);
    if (!existing) throw new HttpError(404, "debt_not_found", "Debt not found.");
    const db = drizzle(env.DB);
    try {
      await db
        .update(debts)
        .set({ ...input, updatedAt: sql`(datetime('now'))` })
        .where(and(eq(debts.id, id), eq(debts.tenantId, tenantId)));
    } catch (error) {
      if (error instanceof Error && error.message.toLocaleLowerCase("en").includes("unique")) {
        throw new HttpError(409, "debt_exists", "A debt with that name already exists.");
      }
      throw error;
    }
    const updated = await findDebt(env, tenantId, id);
    if (!updated) throw new Error("Updated debt could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const db = drizzle(env.DB);
    const result = await db
      .delete(debts)
      .where(and(eq(debts.id, id), eq(debts.tenantId, tenantId)));
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(404, "debt_not_found", "Debt not found.");
    }
  },
};
