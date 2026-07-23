import {
  normalizeSignedAmount,
  type TransactionCalendarMonth,
  type TransactionCalendarQuery,
  type TransactionExportQuery,
  type TransactionInput,
  type TransactionListItem,
  type TransactionListQuery,
  type TransactionPage,
  type TransactionUpdate,
} from "@zoption/shared";
import { and, asc, count, desc, eq, gte, lt, lte, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, categories, transactions } from "../../../../db/schema";
import { HttpError } from "../errors";
import type { Bindings } from "../types";

export interface TransactionRepository {
  list(env: Bindings, tenantId: string, query: TransactionListQuery): Promise<TransactionPage>;
  calendar(
    env: Bindings,
    tenantId: string,
    query: TransactionCalendarQuery,
  ): Promise<TransactionCalendarMonth>;
  create(env: Bindings, tenantId: string, input: TransactionInput): Promise<TransactionListItem>;
  update(
    env: Bindings,
    tenantId: string,
    id: string,
    input: TransactionUpdate,
  ): Promise<TransactionListItem>;
  remove(env: Bindings, tenantId: string, id: string): Promise<void>;
  export(
    env: Bindings,
    tenantId: string,
    query: TransactionExportQuery,
  ): Promise<TransactionListItem[]>;
}

function normalizeAmount(amountMinor: number, kind: TransactionInput["kind"]): number {
  if (kind === "transfer") return amountMinor;
  return normalizeSignedAmount(amountMinor, kind);
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function buildConditions(query: TransactionExportQuery, tenantId: string): SQL[] {
  const conditions: SQL[] = [eq(transactions.tenantId, tenantId)];
  if (query.accountId) conditions.push(eq(transactions.accountId, query.accountId));
  if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
  if (query.kind) conditions.push(eq(transactions.kind, query.kind));
  if (query.from) conditions.push(gte(transactions.date, query.from));
  if (query.to) conditions.push(lte(transactions.date, query.to));
  if (query.search) {
    const pattern = `%${escapeLike(query.search)}%`;
    conditions.push(sql`${transactions.description} LIKE ${pattern} ESCAPE '\\'`);
  }
  return conditions;
}

function getOrderBy(query: TransactionExportQuery) {
  const sortColumn =
    query.sortBy === "description"
      ? transactions.description
      : query.sortBy === "amount"
        ? transactions.amountMinor
        : transactions.date;
  return query.sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn);
}

function nextMonthStart(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

async function validateReferences(
  env: Bindings,
  input: Pick<TransactionInput, "categoryId" | "kind" | "accountId">,
  tenantId: string,
) {
  const db = drizzle(env.DB);
  const [category] = await db
    .select({ kind: categories.kind, archived: categories.archived })
    .from(categories)
    .where(and(eq(categories.id, input.categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!category || category.archived) {
    throw new HttpError(400, "invalid_category", "Choose an active category.");
  }
  if (category.kind !== input.kind) {
    throw new HttpError(
      400,
      "category_kind_mismatch",
      "The category type must match the transaction type.",
    );
  }

  if (input.accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.tenantId, tenantId)))
      .limit(1);
    if (!account) throw new HttpError(400, "invalid_account", "Choose a valid account.");
  }
}

async function findTransaction(
  env: Bindings,
  id: string,
  tenantId: string,
): Promise<TransactionListItem | null> {
  const db = drizzle(env.DB);
  const [row] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      kind: transactions.kind,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountId: transactions.accountId,
      accountName: accounts.name,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(
      categories,
      and(eq(transactions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
    )
    .leftJoin(
      accounts,
      and(eq(transactions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
    )
    .where(and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    currency: "PHP",
    accountName: row.accountName ?? "Unassigned",
  };
}

export const transactionRepository: TransactionRepository = {
  async list(env, tenantId, query) {
    const db = drizzle(env.DB);
    const conditions = buildConditions(query, tenantId);
    const orderBy = getOrderBy(query);
    const where = and(...conditions);
    const offset = (query.page - 1) * query.pageSize;

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          kind: transactions.kind,
          categoryId: categories.id,
          categoryName: categories.name,
          categoryColor: categories.color,
          accountId: transactions.accountId,
          accountName: accounts.name,
          notes: transactions.notes,
        })
        .from(transactions)
        .innerJoin(
          categories,
          and(eq(transactions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
        )
        .leftJoin(
          accounts,
          and(eq(transactions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
        )
        .where(where)
        .orderBy(orderBy, desc(transactions.id))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ value: count() }).from(transactions).where(where),
    ]);

    const total = totalRows[0]?.value ?? 0;
    return {
      items: rows.map((row) => ({
        ...row,
        currency: "PHP",
        accountName: row.accountName ?? "Unassigned",
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  },

  async calendar(env, tenantId, query) {
    const db = drizzle(env.DB);
    const [rows, anyTransactions] = await Promise.all([
      db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          kind: transactions.kind,
          categoryId: categories.id,
          categoryName: categories.name,
          categoryColor: categories.color,
          accountId: transactions.accountId,
          accountName: accounts.name,
          notes: transactions.notes,
        })
        .from(transactions)
        .innerJoin(
          categories,
          and(eq(transactions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
        )
        .leftJoin(
          accounts,
          and(eq(transactions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
        )
        .where(
          and(
            eq(transactions.tenantId, tenantId),
            gte(transactions.date, query.month),
            lt(transactions.date, nextMonthStart(query.month)),
          ),
        )
        .orderBy(asc(transactions.date), desc(transactions.id))
        .limit(5001),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.tenantId, tenantId))
        .limit(1),
    ]);

    if (rows.length > 5000) {
      throw new HttpError(
        413,
        "calendar_month_too_large",
        "This month has too many records for the calendar. Use Transactions to review it.",
      );
    }

    return {
      month: query.month,
      currency: "PHP",
      hasAnyTransactions: anyTransactions.length > 0,
      items: rows.map((row) => ({
        ...row,
        currency: "PHP",
        accountName: row.accountName ?? "Unassigned",
      })),
    };
  },

  async create(env, tenantId, input) {
    await validateReferences(env, input, tenantId);
    const id = crypto.randomUUID();
    const db = drizzle(env.DB);
    await db.insert(transactions).values({
      id,
      tenantId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: input.date,
      description: input.description,
      amountMinor: normalizeAmount(input.amountMinor, input.kind),
      currency: input.currency,
      kind: input.kind,
      notes: input.notes || null,
    });
    const created = await findTransaction(env, id, tenantId);
    if (!created) throw new Error("Created transaction could not be read back.");
    return created;
  },

  async update(env, tenantId, id, input) {
    const existing = await findTransaction(env, id, tenantId);
    if (!existing) throw new HttpError(404, "transaction_not_found", "Transaction not found.");

    const merged: TransactionInput = {
      date: input.date ?? existing.date,
      description: input.description ?? existing.description,
      amountMinor: input.amountMinor ?? existing.amountMinor,
      currency: input.currency ?? existing.currency,
      kind: input.kind ?? existing.kind,
      categoryId: input.categoryId ?? existing.categoryId,
      accountId: input.accountId ?? existing.accountId ?? undefined,
      notes: input.notes !== undefined ? input.notes : (existing.notes ?? undefined),
    };
    await validateReferences(env, merged, tenantId);

    const db = drizzle(env.DB);
    await db
      .update(transactions)
      .set({
        accountId: merged.accountId,
        categoryId: merged.categoryId,
        date: merged.date,
        description: merged.description,
        amountMinor: normalizeAmount(merged.amountMinor, merged.kind),
        currency: merged.currency,
        kind: merged.kind,
        notes: merged.notes || null,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)));

    const updated = await findTransaction(env, id, tenantId);
    if (!updated) throw new Error("Updated transaction could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const db = drizzle(env.DB);
    const deleted = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)))
      .returning({ id: transactions.id });
    if (deleted.length === 0) {
      throw new HttpError(404, "transaction_not_found", "Transaction not found.");
    }
  },

  async export(env, tenantId, query) {
    const db = drizzle(env.DB);
    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        kind: transactions.kind,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryColor: categories.color,
        accountId: transactions.accountId,
        accountName: accounts.name,
        notes: transactions.notes,
      })
      .from(transactions)
      .innerJoin(
        categories,
        and(eq(transactions.categoryId, categories.id), eq(categories.tenantId, tenantId)),
      )
      .leftJoin(
        accounts,
        and(eq(transactions.accountId, accounts.id), eq(accounts.tenantId, tenantId)),
      )
      .where(and(...buildConditions(query, tenantId)))
      .orderBy(getOrderBy(query), desc(transactions.id))
      .limit(5001);
    if (rows.length > 5000) {
      throw new HttpError(
        413,
        "export_too_large",
        "Narrow the filters to export 5,000 rows or fewer.",
      );
    }
    return rows.map((row) => ({
      ...row,
      currency: "PHP",
      accountName: row.accountName ?? "Unassigned",
    }));
  },
};
