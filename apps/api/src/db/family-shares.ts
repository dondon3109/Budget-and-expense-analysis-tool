import {
  isCurrency,
  type FamilySharedBalance,
  type FamilyTransactionShareInput,
  type MyBalanceShare,
  type TransactionInput,
  type TransactionListItem,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import { tenantIdForUser } from "./tenants";
import { findTransaction, insertStatement, validateTransactionReferences } from "./transactions";

/**
 * Sharing from a person's own workspace into a family. Every source row is read from the
 * caller's personal tenant (derived from their user id), never from request input, and the
 * family only ever sees the copy or the one balance number.
 */
export interface FamilyShareRepository {
  shareTransaction(
    env: Bindings,
    familyTenantId: string,
    userId: string,
    input: FamilyTransactionShareInput,
  ): Promise<TransactionListItem>;
  shareBalance(
    env: Bindings,
    familyTenantId: string,
    userId: string,
    accountId: string,
  ): Promise<void>;
  familyBalances(env: Bindings, familyTenantId: string): Promise<FamilySharedBalance[]>;
  removeBalance(env: Bindings, familyTenantId: string, shareId: string): Promise<void>;
  myBalanceShares(env: Bindings, userId: string): Promise<MyBalanceShare[]>;
  stopBalanceShare(env: Bindings, userId: string, shareId: string): Promise<void>;
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Account `a`'s balance in its own currency, summed the way the accounts list sums it. */
const ACCOUNT_BALANCE = `(SELECT COALESCE(SUM(t.amount_minor), 0) FROM transactions t
  WHERE t.tenant_id = a.tenant_id AND t.account_id = a.id AND t.currency = a.currency
    AND (t.kind != 'transfer' OR t.transfer_group_id IS NOT NULL))`;

const SOURCE_ACCOUNT = `FROM accounts a
  WHERE a.tenant_id = family_balance_shares.source_tenant_id
    AND a.id = family_balance_shares.source_account_id`;

/** Fixes live shares matching `where` at the source account's current name and balance. */
function freezeStatement(env: Bindings, where: string, ...bindings: unknown[]) {
  return env.DB.prepare(
    `UPDATE family_balance_shares SET
       frozen_at = ${NOW},
       frozen_name = (SELECT a.name ${SOURCE_ACCOUNT}),
       frozen_currency = (SELECT a.currency ${SOURCE_ACCOUNT}),
       frozen_balance_minor = (SELECT ${ACCOUNT_BALANCE} ${SOURCE_ACCOUNT})
     WHERE frozen_at IS NULL AND ${where}`,
  ).bind(...bindings);
}

/** Runs before a tenant's accounts are purged, so the family keeps the last balance. */
export function freezeBalanceSharesFrom(env: Bindings, sourceTenantId: string) {
  return freezeStatement(env, "source_tenant_id = ?", sourceTenantId);
}

/** Runs when a person leaves or is removed: their shares in that family stop where they are. */
export function freezeMemberBalanceShares(env: Bindings, familyTenantId: string, userId: string) {
  return freezeStatement(
    env,
    "family_tenant_id = ? AND source_tenant_id = ?",
    familyTenantId,
    tenantIdForUser(userId),
  );
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export const familyShareRepository: FamilyShareRepository = {
  async shareTransaction(env, familyTenantId, userId, input) {
    const sourceTenantId = tenantIdForUser(userId);
    const source = await findTransaction(env, sourceTenantId, input.transactionId);
    if (!source) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
    if (source.kind === "transfer") {
      throw new HttpError(400, "transfer_not_shareable", "Share an income or an expense.");
    }
    const alreadyShared = await env.DB.prepare(
      `SELECT 1 FROM family_transaction_shares
       WHERE source_transaction_id = ? AND family_tenant_id = ?`,
    )
      .bind(source.id, familyTenantId)
      .first();
    const duplicate = new HttpError(
      409,
      "transaction_already_shared",
      "This transaction is already in the family.",
    );
    if (alreadyShared) throw duplicate;

    const notes = input.includeNotes ? source.notes?.trim() : undefined;
    const copy: TransactionInput = {
      kind: source.kind,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: source.date,
      description: source.description,
      amountMinor: Math.abs(source.amountMinor),
      currency: source.currency,
      ...(notes ? { notes } : {}),
    };
    await validateTransactionReferences(env, familyTenantId, copy);
    const id = crypto.randomUUID();
    try {
      await env.DB.batch([
        insertStatement(env, {
          id,
          tenantId: familyTenantId,
          accountId: input.accountId,
          categoryId: copy.categoryId,
          date: copy.date,
          description: source.description,
          amountMinor: source.amountMinor,
          currency: copy.currency,
          kind: copy.kind,
          notes: copy.notes,
          authorUserId: userId,
        }),
        env.DB.prepare(
          `INSERT INTO family_transaction_shares
             (source_transaction_id, source_tenant_id, family_tenant_id, family_transaction_id)
           VALUES (?, ?, ?, ?)`,
        ).bind(source.id, sourceTenantId, familyTenantId, id),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate;
      throw error;
    }
    const created = await findTransaction(env, familyTenantId, id);
    if (!created) throw new Error("The shared copy could not be read back.");
    return created;
  },

  async shareBalance(env, familyTenantId, userId, accountId) {
    const sourceTenantId = tenantIdForUser(userId);
    const account = await env.DB.prepare(
      `SELECT archived, deleted_at AS deletedAt FROM accounts WHERE tenant_id = ? AND id = ?`,
    )
      .bind(sourceTenantId, accountId)
      .first<{ archived: number; deletedAt: string | null }>();
    if (!account) throw new HttpError(404, "account_not_found", "The account was not found.");
    if (account.archived || account.deletedAt) {
      throw new HttpError(409, "account_archived", "Share an account you still use.");
    }
    // Sharing a stopped account again brings its card back to life instead of adding a second.
    const result = await env.DB.prepare(
      `INSERT INTO family_balance_shares
         (id, family_tenant_id, source_tenant_id, source_account_id, shared_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (family_tenant_id, source_tenant_id, source_account_id) DO UPDATE SET
         frozen_at = NULL, frozen_name = NULL, frozen_currency = NULL,
         frozen_balance_minor = NULL, created_at = ${NOW}
       WHERE family_balance_shares.frozen_at IS NOT NULL`,
    )
      .bind(crypto.randomUUID(), familyTenantId, sourceTenantId, accountId, userId)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new HttpError(409, "balance_already_shared", "This balance is already in the family.");
    }
  },

  async familyBalances(env, familyTenantId) {
    // An archived or deleted account stops sharing; it is fixed here, on the next read.
    await freezeStatement(
      env,
      `family_tenant_id = ? AND EXISTS (SELECT 1 ${SOURCE_ACCOUNT}
         AND (a.archived = 1 OR a.deleted_at IS NOT NULL))`,
      familyTenantId,
    ).run();
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.shared_by_user_id AS sharedByUserId, s.frozen_at AS stoppedAt,
              COALESCE(s.frozen_name, a.name, 'Account') AS accountName,
              COALESCE(s.frozen_currency, a.currency) AS currency,
              CASE WHEN s.frozen_at IS NULL THEN ${ACCOUNT_BALANCE}
                   ELSE COALESCE(s.frozen_balance_minor, 0) END AS balanceMinor
       FROM family_balance_shares s
       LEFT JOIN accounts a ON a.tenant_id = s.source_tenant_id AND a.id = s.source_account_id
       WHERE s.family_tenant_id = ?
       ORDER BY s.created_at, s.id`,
    )
      .bind(familyTenantId)
      .all<Omit<FamilySharedBalance, "currency"> & { currency: string | null }>();
    return results.flatMap(({ currency, ...row }) =>
      currency && isCurrency(currency) ? [{ ...row, currency }] : [],
    );
  },

  async removeBalance(env, familyTenantId, shareId) {
    const result = await env.DB.prepare(
      "DELETE FROM family_balance_shares WHERE id = ? AND family_tenant_id = ?",
    )
      .bind(shareId, familyTenantId)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new HttpError(404, "balance_share_not_found", "That shared balance was not found.");
    }
  },

  async myBalanceShares(env, userId) {
    const { results } = await env.DB.prepare(
      `SELECT id, family_tenant_id AS familyId, source_account_id AS accountId
       FROM family_balance_shares
       WHERE source_tenant_id = ? AND frozen_at IS NULL
       ORDER BY created_at, id`,
    )
      .bind(tenantIdForUser(userId))
      .all<MyBalanceShare>();
    return results;
  },

  async stopBalanceShare(env, userId, shareId) {
    const result = await freezeStatement(
      env,
      "id = ? AND source_tenant_id = ?",
      shareId,
      tenantIdForUser(userId),
    ).run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new HttpError(404, "balance_share_not_found", "That shared balance was not found.");
    }
  },
};
