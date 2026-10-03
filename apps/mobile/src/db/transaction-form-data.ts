import { accountTypes, resolveCategoryEmoji } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

import type { LocalAccountOption, LocalCategoryOption, TransactionFormData } from "./view-models";

const localAccountOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(accountTypes),
  currency: z.enum(["PHP", "USD"]),
  pending: z
    .number()
    .int()
    .min(0)
    .max(1)
    .transform((value) => value === 1),
}) satisfies z.ZodType<LocalAccountOption>;

export const localCategoryOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["income", "expense", "transfer"]),
    color: z.string(),
    iconEmoji: z.string().nullable().optional(),
    pending: z
      .number()
      .int()
      .min(0)
      .max(1)
      .transform((value) => value === 1),
  })
  .transform((row) => ({
    ...row,
    iconEmoji: resolveCategoryEmoji({ name: row.name, iconEmoji: row.iconEmoji, kind: row.kind }),
  })) satisfies z.ZodType<LocalCategoryOption>;

const editableTransactionRowSchema = z.object({
  id: z.string(),
  account_id: z.string().nullable(),
  category_id: z.string(),
  date: z.string(),
  description: z.string(),
  amount_minor: z.number().int().safe(),
  currency: z.enum(["PHP", "USD"]),
  kind: z.enum(["income", "expense", "transfer"]),
  notes: z.string().nullable(),
  transfer_group_id: z.string().nullable(),
  transfer_fee_minor: z.number().int().safe().nullable(),
  debt_id: z.string().nullable(),
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

/** What the transaction editor needs: pickable accounts and categories, and the row being edited. */
export async function readTransactionFormData(
  database: SQLiteDatabase,
  id?: string,
): Promise<TransactionFormData> {
  const [accounts, categories, transactionRow] = await Promise.all([
    database.getAllAsync(
      `SELECT id, name, type, currency,
        CASE WHEN server_revision = 0 THEN 1 ELSE 0 END AS pending
       FROM accounts
       WHERE deleted_at IS NULL AND archived = 0
         AND (
           server_revision > 0
           OR EXISTS (
             SELECT 1 FROM sync_outbox
             WHERE entity_type = 'account' AND entity_id = accounts.id
               AND operation_type = 'create' AND state = 'pending' AND attempt_count = 0
           )
         )
       ORDER BY name COLLATE NOCASE, id`,
    ),
    database.getAllAsync(
      `SELECT id, name, kind, color, icon_emoji AS iconEmoji,
        CASE WHEN server_revision = 0 THEN 1 ELSE 0 END AS pending
       FROM categories
       WHERE deleted_at IS NULL AND archived = 0 AND locked = 0
         AND (
           server_revision > 0
           OR EXISTS (
             SELECT 1 FROM sync_outbox
             WHERE entity_type = 'category' AND entity_id = categories.id
               AND operation_type = 'create' AND state = 'pending' AND attempt_count = 0
           )
         )
         AND kind IN ('income', 'expense', 'transfer')
       ORDER BY kind, name COLLATE NOCASE, id`,
    ),
    id
      ? database.getFirstAsync(
          `SELECT id, account_id, category_id, date, description, amount_minor, currency,
            kind, notes, transfer_group_id, transfer_fee_minor, debt_id, deleted_at, sync_state
           FROM transactions WHERE id = ?`,
          id,
        )
      : Promise.resolve(null),
  ]);
  const decodedAccounts = z.array(localAccountOptionSchema).parse(accounts);
  const decodedCategories = z.array(localCategoryOptionSchema).parse(categories);
  if (!id) {
    return {
      accounts: decodedAccounts,
      categories: decodedCategories,
      transaction: null,
      unavailableReason: null,
    };
  }
  const decoded = editableTransactionRowSchema.safeParse(transactionRow);
  if (!decoded.success || decoded.data.deleted_at) {
    return {
      accounts: decodedAccounts,
      categories: decodedCategories,
      transaction: null,
      unavailableReason: "This transaction is no longer available on this device.",
    };
  }
  if (decoded.data.kind === "transfer") {
    if (!decoded.data.transfer_group_id) {
      return {
        accounts: decodedAccounts,
        categories: decodedCategories,
        transaction: null,
        unavailableReason: "This historical transfer is not linked to a complete transfer pair.",
      };
    }
    const pair = z.array(editableTransactionRowSchema).parse(
      await database.getAllAsync(
        `SELECT id, account_id, category_id, date, description, amount_minor, currency,
          kind, notes, transfer_group_id, transfer_fee_minor, debt_id, deleted_at, sync_state
         FROM transactions WHERE transfer_group_id = ? ORDER BY amount_minor, id`,
        decoded.data.transfer_group_id,
      ),
    );
    const from = pair.find((row) => row.amount_minor < 0);
    const to = pair.find((row) => row.amount_minor > 0);
    if (
      pair.length !== 2 ||
      !from ||
      !to ||
      !from.account_id ||
      !to.account_id ||
      to.amount_minor !== Math.abs(from.amount_minor) - (from.transfer_fee_minor ?? 0)
    ) {
      return {
        accounts: decodedAccounts,
        categories: decodedCategories,
        transaction: null,
        unavailableReason: "This transfer pair is incomplete and cannot be edited safely.",
      };
    }
    return {
      accounts: decodedAccounts,
      categories: decodedCategories,
      transaction: {
        id: from.id,
        input: {
          kind: "transfer",
          debtId: from.debt_id,
          fromAccountId: from.account_id,
          toAccountId: to.account_id,
          categoryId: from.category_id,
          date: from.date,
          description: from.description,
          amountMinor: Math.abs(from.amount_minor),
          transferFeeMinor: from.transfer_fee_minor ?? 0,
          currency: from.currency,
          notes: from.notes ?? undefined,
        },
        syncState:
          from.sync_state === "conflicted" || to.sync_state === "conflicted"
            ? "conflicted"
            : from.sync_state === "failed" || to.sync_state === "failed"
              ? "failed"
              : from.sync_state === "pending" || to.sync_state === "pending"
                ? "pending"
                : "synced",
      },
      unavailableReason: null,
    };
  }
  if (!decoded.data.account_id) {
    return {
      accounts: decodedAccounts,
      categories: decodedCategories,
      transaction: null,
      unavailableReason:
        "Transfers cannot be edited until the atomic offline transfer protocol is ready.",
    };
  }
  return {
    accounts: decodedAccounts,
    categories: decodedCategories,
    transaction: {
      id: decoded.data.id,
      input: {
        ...(decoded.data.kind === "expense" ? { debtId: decoded.data.debt_id } : {}),
        kind: decoded.data.kind,
        accountId: decoded.data.account_id,
        categoryId: decoded.data.category_id,
        date: decoded.data.date,
        description: decoded.data.description,
        amountMinor: Math.abs(decoded.data.amount_minor),
        currency: decoded.data.currency,
        notes: decoded.data.notes ?? undefined,
      },
      syncState: decoded.data.sync_state,
    },
    unavailableReason: null,
  };
}
