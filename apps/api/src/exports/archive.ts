import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  accounts,
  budgets,
  calendarEvents,
  categories,
  debts,
  financialGoals,
  subscriptions,
} from "../../../../db/schema";
import type { TransactionListItem } from "@zoption/shared";
import type { TransactionRepository } from "../db/transactions";
import type { Bindings } from "../types";

export interface AccountArchive {
  version: "1.0";
  exportedAt: string;
  user: {
    id: string;
    email: string;
  };
  accounts: unknown[];
  categories: unknown[];
  transactions: TransactionListItem[];
  budgets: unknown[];
  subscriptions: unknown[];
  goals: unknown[];
  debts: unknown[];
  calendarEvents: unknown[];
}

export async function buildAccountArchive(args: {
  env: Bindings;
  tenantId: string;
  user: { id: string; email: string };
  transactionRepository: TransactionRepository;
}): Promise<AccountArchive> {
  const db = drizzle(args.env.DB);
  const [
    accountRows,
    categoryRows,
    transactionRows,
    budgetRows,
    subscriptionRows,
    goalRows,
    debtRows,
    eventRows,
  ] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.tenantId, args.tenantId)),
    db.select().from(categories).where(eq(categories.tenantId, args.tenantId)),
    args.transactionRepository.export(args.env, args.tenantId, {
      sortBy: "date",
      sortDirection: "desc",
    }),
    db.select().from(budgets).where(eq(budgets.tenantId, args.tenantId)),
    db.select().from(subscriptions).where(eq(subscriptions.tenantId, args.tenantId)),
    db.select().from(financialGoals).where(eq(financialGoals.tenantId, args.tenantId)),
    db.select().from(debts).where(eq(debts.tenantId, args.tenantId)),
    db.select().from(calendarEvents).where(eq(calendarEvents.tenantId, args.tenantId)),
  ]);

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    user: {
      id: args.user.id,
      email: args.user.email,
    },
    accounts: accountRows.map(stripTenantId),
    categories: categoryRows.map(stripTenantId),
    transactions: transactionRows,
    budgets: budgetRows.map(stripTenantId),
    subscriptions: subscriptionRows.map(stripTenantId),
    goals: goalRows.map(stripTenantId),
    debts: debtRows.map(stripTenantId),
    calendarEvents: eventRows.map(stripTenantId),
  };
}

function stripTenantId<T extends Record<string, unknown>>(row: T): Omit<T, "tenantId"> {
  const copy = { ...row };
  delete copy.tenantId;
  return copy;
}
