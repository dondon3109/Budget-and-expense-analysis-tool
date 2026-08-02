import type { FinancialGoal, FinancialGoalInput, FinancialGoalUpdate } from "@zoption/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { financialGoals } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface FinancialGoalRepository {
  list(env: Bindings, tenantId: string): Promise<FinancialGoal[]>;
  create(env: Bindings, tenantId: string, input: FinancialGoalInput): Promise<FinancialGoal>;
  update(
    env: Bindings,
    tenantId: string,
    id: string,
    input: FinancialGoalUpdate,
  ): Promise<FinancialGoal>;
  remove(env: Bindings, tenantId: string, id: string): Promise<void>;
}

async function findGoal(
  env: Bindings,
  tenantId: string,
  id: string,
): Promise<FinancialGoal | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({
      id: financialGoals.id,
      name: financialGoals.name,
      targetAmountMinor: financialGoals.targetAmountMinor,
      currentAmountMinor: financialGoals.currentAmountMinor,
      targetDate: financialGoals.targetDate,
      status: financialGoals.status,
      createdAt: financialGoals.createdAt,
      updatedAt: financialGoals.updatedAt,
    })
    .from(financialGoals)
    .where(and(eq(financialGoals.id, id), eq(financialGoals.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export const financialGoalRepository: FinancialGoalRepository = {
  async list(env, tenantId) {
    const db = drizzle(env.DB);
    return db
      .select({
        id: financialGoals.id,
        name: financialGoals.name,
        targetAmountMinor: financialGoals.targetAmountMinor,
        currentAmountMinor: financialGoals.currentAmountMinor,
        targetDate: financialGoals.targetDate,
        status: financialGoals.status,
        createdAt: financialGoals.createdAt,
        updatedAt: financialGoals.updatedAt,
      })
      .from(financialGoals)
      .where(eq(financialGoals.tenantId, tenantId))
      .orderBy(
        asc(financialGoals.status),
        asc(financialGoals.targetDate),
        asc(financialGoals.name),
      );
  },

  async create(env, tenantId, input) {
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    try {
      await db.insert(financialGoals).values({ id, tenantId, ...input });
    } catch (error) {
      if (error instanceof Error && error.message.toLocaleLowerCase("en").includes("unique")) {
        throw new HttpError(409, "financial_goal_exists", "A goal with that name already exists.");
      }
      throw error;
    }
    const created = await findGoal(env, tenantId, id);
    if (!created) throw new Error("Created financial goal could not be read back.");
    return created;
  },

  async update(env, tenantId, id, input) {
    const existing = await findGoal(env, tenantId, id);
    if (!existing) throw new HttpError(404, "financial_goal_not_found", "Goal not found.");
    const targetAmountMinor = input.targetAmountMinor ?? existing.targetAmountMinor;
    const currentAmountMinor = input.currentAmountMinor ?? existing.currentAmountMinor;
    if (currentAmountMinor > targetAmountMinor) {
      throw new HttpError(
        400,
        "invalid_financial_goal",
        "Current savings cannot exceed the target amount.",
      );
    }
    const db = drizzle(env.DB);
    try {
      await db
        .update(financialGoals)
        .set({ ...input, updatedAt: sql`(datetime('now'))` })
        .where(and(eq(financialGoals.id, id), eq(financialGoals.tenantId, tenantId)));
    } catch (error) {
      if (error instanceof Error && error.message.toLocaleLowerCase("en").includes("unique")) {
        throw new HttpError(409, "financial_goal_exists", "A goal with that name already exists.");
      }
      throw error;
    }
    const updated = await findGoal(env, tenantId, id);
    if (!updated) throw new Error("Updated financial goal could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const db = drizzle(env.DB);
    const result = await db
      .delete(financialGoals)
      .where(and(eq(financialGoals.id, id), eq(financialGoals.tenantId, tenantId)));
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(404, "financial_goal_not_found", "Goal not found.");
    }
  },
};
