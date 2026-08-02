import {
  normalizeSignedAmount,
  transactionInputSchema,
  type TransactionCalendarMonth,
  type TransactionCalendarQuery,
  type TransactionExportQuery,
  type TransactionInput,
  type TransactionListItem,
  type TransactionListQuery,
  type TransactionPage,
  type TransactionUpdate,
} from "@zoption/shared";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { accounts, categories } from "../../../../db/schema";
import { categoryRequiresProError, hasProEntitlement, isCategoryPlanAvailable } from "./billing";
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

type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amountMinor: number;
  currency: string;
  kind: "income" | "expense" | "transfer";
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  accountId: string | null;
  accountName: string | null;
  notes: string | null;
  transferGroupId: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
};

function nextMonthStart(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizeRow(row: TransactionRow): TransactionListItem {
  const linkedTransfer = row.kind === "transfer" && row.transferGroupId !== null;
  return {
    ...row,
    amountMinor: linkedTransfer ? Math.abs(row.amountMinor) : row.amountMinor,
    currency: "PHP",
    accountName: row.accountName ?? "Unassigned",
    fromAccountId: linkedTransfer ? row.accountId : null,
    fromAccountName: linkedTransfer ? (row.accountName ?? "Unassigned") : null,
    toAccountId: linkedTransfer ? row.toAccountId : null,
    toAccountName: linkedTransfer ? (row.toAccountName ?? "Unassigned") : null,
    legacyTransfer: row.kind === "transfer" && !linkedTransfer,
  };
}

function logicalRowsSql(
  query: TransactionExportQuery,
  tenantId: string,
): { sql: string; bindings: unknown[] } {
  const where = [
    "t.tenant_id = ?",
    "(t.kind != 'transfer' OR t.transfer_group_id IS NULL OR t.amount_minor < 0)",
  ];
  const bindings: unknown[] = [tenantId];

  if (query.accountId) {
    where.push("(t.account_id = ? OR peer.account_id = ?)");
    bindings.push(query.accountId, query.accountId);
  }
  if (query.categoryId) {
    where.push("t.category_id = ?");
    bindings.push(query.categoryId);
  }
  if (query.kind) {
    where.push("t.kind = ?");
    bindings.push(query.kind);
  }
  if (query.from) {
    where.push("t.date >= ?");
    bindings.push(query.from);
  }
  if (query.to) {
    where.push("t.date <= ?");
    bindings.push(query.to);
  }
  if (query.search) {
    const pattern = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    where.push(`(
      t.description LIKE ? ESCAPE '\\'
      OR COALESCE(t.notes, '') LIKE ? ESCAPE '\\'
      OR COALESCE(a.name, '') LIKE ? ESCAPE '\\'
      OR COALESCE(destination.name, '') LIKE ? ESCAPE '\\'
      OR c.name LIKE ? ESCAPE '\\'
    )`);
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }

  const orderColumn =
    query.sortBy === "description"
      ? "t.description"
      : query.sortBy === "amount"
        ? "ABS(t.amount_minor)"
        : "t.date";
  const direction = query.sortDirection === "asc" ? "ASC" : "DESC";
  const orderBy =
    query.sortBy === "date"
      ? `${orderColumn} ${direction}, t.created_at DESC, t.id DESC`
      : `${orderColumn} ${direction}, t.date DESC, t.created_at DESC, t.id DESC`;
  return {
    sql: `
      SELECT
        t.id AS id,
        t.date AS date,
        t.description AS description,
        t.amount_minor AS amountMinor,
        t.currency AS currency,
        t.kind AS kind,
        c.id AS categoryId,
        c.name AS categoryName,
        c.color AS categoryColor,
        t.account_id AS accountId,
        a.name AS accountName,
        t.notes AS notes,
        t.transfer_group_id AS transferGroupId,
        peer.account_id AS toAccountId,
        destination.name AS toAccountName
      FROM transactions t
      INNER JOIN categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
      LEFT JOIN accounts a ON a.id = t.account_id AND a.tenant_id = t.tenant_id
      LEFT JOIN transactions peer
        ON peer.tenant_id = t.tenant_id
        AND peer.transfer_group_id = t.transfer_group_id
        AND peer.id != t.id
        AND peer.amount_minor > 0
      LEFT JOIN accounts destination ON destination.id = peer.account_id AND destination.tenant_id = t.tenant_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}`,
    bindings,
  };
}

async function readLogicalRows(
  env: Bindings,
  tenantId: string,
  query: TransactionExportQuery,
): Promise<TransactionListItem[]> {
  const statement = logicalRowsSql(query, tenantId);
  const result = await env.DB.prepare(statement.sql)
    .bind(...statement.bindings)
    .all<TransactionRow>();
  return result.results.map(normalizeRow);
}

async function validateReferences(
  env: Bindings,
  tenantId: string,
  input: TransactionInput,
  existingCategoryId?: string,
): Promise<void> {
  const db = drizzle(env.DB);
  const [category] = await db
    .select({
      kind: categories.kind,
      archived: categories.archived,
      requiredPlan: categories.requiredPlan,
    })
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
  if (
    input.categoryId !== existingCategoryId &&
    !isCategoryPlanAvailable(category.requiredPlan, await hasProEntitlement(env, tenantId))
  ) {
    throw categoryRequiresProError();
  }

  const accountIds =
    input.kind === "transfer" ? [input.fromAccountId, input.toAccountId] : [input.accountId];
  const found = await Promise.all(
    accountIds.map(async (accountId) => {
      const [account] = await db
        .select({ id: accounts.id, archived: accounts.archived })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
        .limit(1);
      return account;
    }),
  );
  if (found.some((account) => !account || account.archived)) {
    throw new HttpError(400, "invalid_account", "Choose an active account.");
  }
}

async function findTransaction(
  env: Bindings,
  tenantId: string,
  id: string,
): Promise<TransactionListItem | null> {
  const rows = await readLogicalRows(env, tenantId, {
    sortBy: "date",
    sortDirection: "desc",
  });
  return rows.find((row) => row.id === id) ?? null;
}

function insertStatement(
  env: Bindings,
  values: {
    id: string;
    tenantId: string;
    accountId: string;
    categoryId: string;
    date: string;
    description: string;
    amountMinor: number;
    currency: "PHP";
    kind: TransactionInput["kind"];
    notes?: string;
    transferGroupId?: string;
  },
) {
  return env.DB.prepare(
    `INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind, notes, transfer_group_id, source_kind
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  ).bind(
    values.id,
    values.tenantId,
    values.accountId,
    values.categoryId,
    values.date,
    values.description,
    values.amountMinor,
    values.currency,
    values.kind,
    values.notes || null,
    values.transferGroupId ?? null,
  );
}

export const transactionRepository: TransactionRepository = {
  async list(env, tenantId, query) {
    const rows = await readLogicalRows(env, tenantId, query);
    const total = rows.length;
    const offset = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  },

  async calendar(env, tenantId, query) {
    const items = await readLogicalRows(env, tenantId, {
      sortBy: "date",
      sortDirection: "asc",
      from: query.month,
      to: nextMonthStart(query.month),
    });
    const inMonth = items.filter((item) => item.date < nextMonthStart(query.month));
    if (inMonth.length > 5000) {
      throw new HttpError(
        413,
        "calendar_month_too_large",
        "This month has too many records for the calendar. Use Transactions to review it.",
      );
    }
    const any = await env.DB.prepare("SELECT id FROM transactions WHERE tenant_id = ? LIMIT 1")
      .bind(tenantId)
      .first();
    return {
      month: query.month,
      currency: "PHP",
      hasAnyTransactions: Boolean(any),
      items: inMonth,
    };
  },

  async create(env, tenantId, input) {
    await validateReferences(env, tenantId, input);
    if (input.kind === "transfer") {
      const groupId = crypto.randomUUID();
      const fromId = crypto.randomUUID();
      const toId = crypto.randomUUID();
      await env.DB.batch([
        insertStatement(env, {
          id: fromId,
          tenantId,
          accountId: input.fromAccountId,
          categoryId: input.categoryId,
          date: input.date,
          description: input.description,
          amountMinor: -input.amountMinor,
          currency: input.currency,
          kind: input.kind,
          notes: input.notes,
          transferGroupId: groupId,
        }),
        insertStatement(env, {
          id: toId,
          tenantId,
          accountId: input.toAccountId,
          categoryId: input.categoryId,
          date: input.date,
          description: input.description,
          amountMinor: input.amountMinor,
          currency: input.currency,
          kind: input.kind,
          notes: input.notes,
          transferGroupId: groupId,
        }),
      ]);
      const created = await findTransaction(env, tenantId, fromId);
      if (!created) throw new Error("Created transfer could not be read back.");
      return created;
    }

    const id = crypto.randomUUID();
    await insertStatement(env, {
      id,
      tenantId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: input.date,
      description: input.description,
      amountMinor: normalizeSignedAmount(input.amountMinor, input.kind),
      currency: input.currency,
      kind: input.kind,
      notes: input.notes,
    }).run();
    const created = await findTransaction(env, tenantId, id);
    if (!created) throw new Error("Created transaction could not be read back.");
    return created;
  },

  async update(env, tenantId, id, input) {
    const existing = await env.DB.prepare(
      "SELECT transfer_group_id AS transferGroupId, category_id AS categoryId FROM transactions WHERE id = ? AND tenant_id = ?",
    )
      .bind(id, tenantId)
      .first<{ transferGroupId: string | null; categoryId: string }>();
    if (!existing) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
    if (existing.transferGroupId) {
      const parsed = transactionInputSchema.safeParse(input);
      if (!parsed.success || parsed.data.kind !== "transfer") {
        throw new HttpError(400, "invalid_transfer_update", "Provide complete transfer details.");
      }
      const transfer = parsed.data;
      await validateReferences(env, tenantId, transfer, existing.categoryId);
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?, currency = ?, kind = 'transfer', notes = ?, updated_at = datetime('now') WHERE tenant_id = ? AND transfer_group_id = ? AND amount_minor < 0`,
        ).bind(
          transfer.fromAccountId,
          transfer.categoryId,
          transfer.date,
          transfer.description,
          -transfer.amountMinor,
          transfer.currency,
          transfer.notes || null,
          tenantId,
          existing.transferGroupId,
        ),
        env.DB.prepare(
          `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?, currency = ?, kind = 'transfer', notes = ?, updated_at = datetime('now') WHERE tenant_id = ? AND transfer_group_id = ? AND amount_minor > 0`,
        ).bind(
          transfer.toAccountId,
          transfer.categoryId,
          transfer.date,
          transfer.description,
          transfer.amountMinor,
          transfer.currency,
          transfer.notes || null,
          tenantId,
          existing.transferGroupId,
        ),
      ]);
      const updated = await findTransaction(env, tenantId, id);
      if (!updated) throw new Error("Updated transfer could not be read back.");
      return updated;
    }

    const current = await findTransaction(env, tenantId, id);
    if (!current || current.kind === "transfer") {
      throw new HttpError(
        400,
        "legacy_transfer_read_only",
        "Replace this historical transfer with a new transfer between two accounts.",
      );
    }
    const parsed = transactionInputSchema.safeParse({
      date: input.date ?? current.date,
      description: input.description ?? current.description,
      amountMinor: input.amountMinor ?? Math.abs(current.amountMinor),
      currency: input.currency ?? current.currency,
      kind: input.kind ?? current.kind,
      categoryId: input.categoryId ?? current.categoryId,
      accountId: input.accountId ?? current.accountId,
      notes: input.notes !== undefined ? input.notes : (current.notes ?? undefined),
    });
    if (!parsed.success || parsed.data.kind === "transfer") {
      throw new HttpError(400, "invalid_transaction_update", "Provide valid transaction details.");
    }
    const transaction = parsed.data;
    await validateReferences(env, tenantId, transaction, current.categoryId);
    await env.DB.prepare(
      `UPDATE transactions SET account_id = ?, category_id = ?, date = ?, description = ?, amount_minor = ?, currency = ?, kind = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    )
      .bind(
        transaction.accountId,
        transaction.categoryId,
        transaction.date,
        transaction.description,
        normalizeSignedAmount(transaction.amountMinor, transaction.kind),
        transaction.currency,
        transaction.kind,
        transaction.notes || null,
        id,
        tenantId,
      )
      .run();
    const updated = await findTransaction(env, tenantId, id);
    if (!updated) throw new Error("Updated transaction could not be read back.");
    return updated;
  },

  async remove(env, tenantId, id) {
    const existing = await env.DB.prepare(
      "SELECT transfer_group_id AS transferGroupId FROM transactions WHERE id = ? AND tenant_id = ?",
    )
      .bind(id, tenantId)
      .first<{ transferGroupId: string | null }>();
    if (!existing) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
    const statement = existing.transferGroupId
      ? env.DB.prepare(
          "DELETE FROM transactions WHERE tenant_id = ? AND transfer_group_id = ?",
        ).bind(tenantId, existing.transferGroupId)
      : env.DB.prepare("DELETE FROM transactions WHERE tenant_id = ? AND id = ?").bind(
          tenantId,
          id,
        );
    await statement.run();
  },

  async export(env, tenantId, query) {
    const rows = await readLogicalRows(env, tenantId, query);
    if (rows.length > 5000) {
      throw new HttpError(
        413,
        "export_too_large",
        "Narrow the filters to export 5,000 rows or fewer.",
      );
    }
    return rows;
  },
};
