import type { TransactionInput, TransactionListItem } from "@zoption/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { z } from "zod";

const workspaceStatsRowSchema = z.object({
  account_count: z.number().int().nonnegative(),
  category_count: z.number().int().nonnegative(),
  transaction_count: z.number().int().nonnegative(),
  unsynced_operation_count: z.number().int().nonnegative(),
  unresolved_conflict_count: z.number().int().nonnegative(),
});

export interface LocalWorkspaceStats {
  accountCount: number;
  categoryCount: number;
  transactionCount: number;
  unsyncedOperationCount: number;
  unresolvedConflictCount: number;
}

const localTransactionRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  amount_minor: z.number().int().safe(),
  currency: z.enum(["PHP", "USD"]),
  kind: z.enum(["income", "expense", "transfer"]),
  category_id: z.string(),
  category_name: z.string(),
  category_color: z.string(),
  account_id: z.string().nullable(),
  account_name: z.string().nullable(),
  notes: z.string().nullable(),
  transfer_group_id: z.string().nullable(),
  transfer_fee_minor: z.number().int().safe().nullable(),
  to_account_id: z.string().nullable(),
  to_account_name: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

export interface LocalTransactionItem {
  transaction: TransactionListItem;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

type EditableTransactionInput = Extract<TransactionInput, { kind: "income" | "expense" }>;

const localAccountOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  currency: z.enum(["PHP", "USD"]),
});

const localCategoryOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["income", "expense"]),
  color: z.string(),
});

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
  deleted_at: z.string().nullable(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

export type LocalAccountOption = z.infer<typeof localAccountOptionSchema>;

export type LocalCategoryOption = z.infer<typeof localCategoryOptionSchema>;

export interface EditableLocalTransaction {
  id: string;
  input: EditableTransactionInput;
  syncState: "synced" | "pending" | "failed" | "conflicted";
}

export interface TransactionFormData {
  accounts: LocalAccountOption[];
  categories: LocalCategoryOption[];
  transaction: EditableLocalTransaction | null;
  unavailableReason: string | null;
}

const localAccountItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["cash", "checking", "savings", "credit", "other"]),
  currency: z.enum(["PHP", "USD"]),
  system: z.number().int().min(0).max(1),
  server_revision: z.number().int().nonnegative(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

const localCategoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["income", "expense", "transfer"]),
  color: z.string(),
  system: z.number().int().min(0).max(1),
  required_plan: z.enum(["free", "zoption_pro"]),
  locked: z.number().int().min(0).max(1),
  server_revision: z.number().int().nonnegative(),
  sync_state: z.enum(["synced", "pending", "failed", "conflicted"]),
});

export interface LocalAccountItem {
  id: string;
  name: string;
  type: z.infer<typeof localAccountItemSchema>["type"];
  currency: z.infer<typeof localAccountItemSchema>["currency"];
  system: boolean;
  serverRevision: number;
  syncState: z.infer<typeof localAccountItemSchema>["sync_state"];
}

export interface LocalCategoryItem {
  id: string;
  name: string;
  kind: z.infer<typeof localCategoryItemSchema>["kind"];
  color: string;
  system: boolean;
  requiredPlan: z.infer<typeof localCategoryItemSchema>["required_plan"];
  locked: boolean;
  serverRevision: number;
  syncState: z.infer<typeof localCategoryItemSchema>["sync_state"];
}

export interface LocalReferenceData {
  accounts: LocalAccountItem[];
  categories: LocalCategoryItem[];
}

export class LocalWorkspaceRepository {
  constructor(private readonly database: SQLiteDatabase) {}

  async getStats(): Promise<LocalWorkspaceStats> {
    const decoded = workspaceStatsRowSchema.parse(
      await this.database.getFirstAsync(`
        SELECT
          (SELECT count(*) FROM accounts WHERE deleted_at IS NULL) AS account_count,
          (SELECT count(*) FROM categories WHERE deleted_at IS NULL) AS category_count,
          (SELECT count(*) FROM transactions
            WHERE deleted_at IS NULL
              AND (kind != 'transfer' OR transfer_group_id IS NULL OR amount_minor < 0))
            AS transaction_count,
          (SELECT count(*) FROM sync_outbox
            WHERE state IN ('pending', 'sending', 'retryable', 'failed', 'conflicted'))
            AS unsynced_operation_count,
          (SELECT count(*) FROM sync_conflicts WHERE resolved_at IS NULL)
            AS unresolved_conflict_count
      `),
    );
    return {
      accountCount: decoded.account_count,
      categoryCount: decoded.category_count,
      transactionCount: decoded.transaction_count,
      unsyncedOperationCount: decoded.unsynced_operation_count,
      unresolvedConflictCount: decoded.unresolved_conflict_count,
    };
  }

  async listTransactions(limit = 100): Promise<LocalTransactionItem[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Choose a transaction page size from 1 to 200.");
    }
    const rows = z.array(localTransactionRowSchema).parse(
      await this.database.getAllAsync(
        `SELECT
          transaction_row.id,
          transaction_row.date,
          transaction_row.description,
          transaction_row.amount_minor,
          transaction_row.currency,
          transaction_row.kind,
          transaction_row.category_id,
          category.name AS category_name,
          category.color AS category_color,
          transaction_row.account_id,
          account.name AS account_name,
          transaction_row.notes,
          transaction_row.transfer_group_id,
          transaction_row.transfer_fee_minor,
          peer.account_id AS to_account_id,
          destination.name AS to_account_name,
          transaction_row.sync_state
        FROM transactions transaction_row
        INNER JOIN categories category
          ON category.id = transaction_row.category_id AND category.deleted_at IS NULL
        LEFT JOIN accounts account
          ON account.id = transaction_row.account_id AND account.deleted_at IS NULL
        LEFT JOIN transactions peer
          ON peer.transfer_group_id = transaction_row.transfer_group_id
          AND peer.id != transaction_row.id
          AND peer.amount_minor > 0
          AND peer.deleted_at IS NULL
        LEFT JOIN accounts destination
          ON destination.id = peer.account_id AND destination.deleted_at IS NULL
        WHERE transaction_row.deleted_at IS NULL
          AND (
            transaction_row.kind != 'transfer'
            OR transaction_row.transfer_group_id IS NULL
            OR transaction_row.amount_minor < 0
          )
        ORDER BY transaction_row.date DESC, transaction_row.id DESC
        LIMIT ?`,
        limit,
      ),
    );
    return rows.map((row) => {
      const linkedTransfer = row.kind === "transfer" && row.transfer_group_id !== null;
      const transaction: TransactionListItem = {
        id: row.id,
        date: row.date,
        description: row.description,
        amountMinor: linkedTransfer ? Math.abs(row.amount_minor) : row.amount_minor,
        currency: row.currency,
        kind: row.kind,
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryColor: row.category_color,
        accountId: row.account_id,
        accountName: row.account_name ?? "Unassigned",
        notes: row.notes,
        transferGroupId: row.transfer_group_id,
        fromAccountId: linkedTransfer ? row.account_id : null,
        fromAccountName: linkedTransfer ? (row.account_name ?? "Unassigned") : null,
        toAccountId: linkedTransfer ? row.to_account_id : null,
        toAccountName: linkedTransfer ? (row.to_account_name ?? "Unassigned") : null,
        transferFeeMinor: row.transfer_fee_minor,
        legacyTransfer: row.kind === "transfer" && !linkedTransfer,
      };
      return { transaction, syncState: row.sync_state };
    });
  }

  async getReferenceData(): Promise<LocalReferenceData> {
    const [accountRows, categoryRows] = await Promise.all([
      this.database.getAllAsync(
        `SELECT id, name, type, currency, system, server_revision, sync_state
         FROM accounts
         WHERE deleted_at IS NULL AND archived = 0
         ORDER BY name COLLATE NOCASE, id`,
      ),
      this.database.getAllAsync(
        `SELECT id, name, kind, color, system, required_plan, locked,
          server_revision, sync_state
         FROM categories
         WHERE deleted_at IS NULL AND archived = 0
         ORDER BY kind, name COLLATE NOCASE, id`,
      ),
    ]);
    return {
      accounts: z
        .array(localAccountItemSchema)
        .parse(accountRows)
        .map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          currency: row.currency,
          system: row.system === 1,
          serverRevision: row.server_revision,
          syncState: row.sync_state,
        })),
      categories: z
        .array(localCategoryItemSchema)
        .parse(categoryRows)
        .map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          color: row.color,
          system: row.system === 1,
          requiredPlan: row.required_plan,
          locked: row.locked === 1,
          serverRevision: row.server_revision,
          syncState: row.sync_state,
        })),
    };
  }

  async getTransactionFormData(id?: string): Promise<TransactionFormData> {
    const [accounts, categories, transactionRow] = await Promise.all([
      this.database.getAllAsync(
        `SELECT id, name, currency
         FROM accounts
         WHERE deleted_at IS NULL AND archived = 0 AND server_revision > 0
         ORDER BY name COLLATE NOCASE, id`,
      ),
      this.database.getAllAsync(
        `SELECT id, name, kind, color
         FROM categories
         WHERE deleted_at IS NULL AND archived = 0 AND locked = 0
           AND server_revision > 0
           AND kind IN ('income', 'expense')
         ORDER BY kind, name COLLATE NOCASE, id`,
      ),
      id
        ? this.database.getFirstAsync(
            `SELECT id, account_id, category_id, date, description, amount_minor, currency,
              kind, notes, deleted_at, sync_state
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
    if (decoded.data.kind === "transfer" || !decoded.data.account_id) {
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
}
