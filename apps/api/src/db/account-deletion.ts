import type { Bindings } from "../types";
import { tenantIdForUser } from "./tenants";

export type AccountDeletionStatus = "deleted" | "cleanup_pending";
export type AccountDeletionErrorCode =
  "storage_unavailable" | "auth_unavailable" | "configuration_missing";

export interface AccountDeletionRecord {
  userId: string;
  storagePurgedAt: string | null;
  authDeletedAt: string | null;
  cleanupAttempts: number;
  cleanupLeaseUntil: string | null;
  lastErrorCode: AccountDeletionErrorCode | null;
}

export interface AccountDeletionRepository {
  find(env: Bindings, userId: string): Promise<AccountDeletionRecord | null>;
  purgeTenant(env: Bindings, userId: string): Promise<AccountDeletionRecord>;
  claimPendingCleanup(env: Bindings, limit: number): Promise<AccountDeletionRecord[]>;
  markStoragePurged(env: Bindings, userId: string): Promise<void>;
  markAuthDeleted(env: Bindings, userId: string): Promise<void>;
  releaseCleanup(env: Bindings, userId: string, errorCode: AccountDeletionErrorCode): Promise<void>;
}

interface AccountDeletionRow {
  userId: string;
  storagePurgedAt: string | null;
  authDeletedAt: string | null;
  cleanupAttempts: number;
  cleanupLeaseUntil: string | null;
  lastErrorCode: AccountDeletionErrorCode | null;
}

function toRecord(row: AccountDeletionRow): AccountDeletionRecord {
  return {
    userId: row.userId,
    storagePurgedAt: row.storagePurgedAt,
    authDeletedAt: row.authDeletedAt,
    cleanupAttempts: row.cleanupAttempts,
    cleanupLeaseUntil: row.cleanupLeaseUntil,
    lastErrorCode: row.lastErrorCode,
  };
}

function now(): string {
  return new Date().toISOString();
}

function cleanupLeaseUntil(): string {
  return new Date(Date.now() + 5 * 60 * 1_000).toISOString();
}

export const accountDeletionRepository: AccountDeletionRepository = {
  async find(env, userId) {
    const row = await env.DB.prepare(
      `SELECT user_id AS userId, storage_purged_at AS storagePurgedAt,
              auth_deleted_at AS authDeletedAt, cleanup_attempts AS cleanupAttempts,
              cleanup_lease_until AS cleanupLeaseUntil, last_error_code AS lastErrorCode
       FROM account_deletions WHERE user_id = ?`,
    )
      .bind(userId)
      .first<AccountDeletionRow>();
    return row ? toRecord(row) : null;
  },

  async purgeTenant(env, userId) {
    const existing = await this.find(env, userId);
    if (existing) return existing;

    const tenantId = tenantIdForUser(userId);
    const deletedAt = now();
    // Keep this explicit list in sync with every tenant_id table in db/schema.ts.
    // The tombstone is inserted in the same D1 batch as the local purge so an
    // old JWT can never bootstrap a replacement workspace between operations.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO account_deletions (user_id, requested_at, tenant_deleted_at)
         VALUES (?, ?, ?)`,
      ).bind(userId, deletedAt, deletedAt),
      env.DB.prepare(
        `UPDATE sponsored_pro_seats
         SET state = 'empty', pending_email = NULL, beneficiary_user_id = NULL,
             invited_at = NULL, invite_last_sent_at = NULL, invite_send_lease_until = NULL,
             invite_send_lease_token = NULL, assigned_at = NULL, updated_at = datetime('now')
         WHERE state = 'active' AND beneficiary_user_id = ?`,
      ).bind(userId),
      env.DB.prepare("DELETE FROM app_user_identities WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM assistant_tool_calls WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM assistant_runs WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM assistant_messages WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM assistant_threads WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM assistant_preferences WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM billing_monthly_usage WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM billing_checkout_references WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM billing_subscriptions WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM billing_customers WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM import_previews WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM imports WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM financial_goals WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM debts WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM budgets WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM subscriptions WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM transactions WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM calendar_events WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM accounts WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM categories WHERE tenant_id = ?").bind(tenantId),
      env.DB.prepare("DELETE FROM user_tenants WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM tenants WHERE id = ?").bind(tenantId),
    ]);

    const created = await this.find(env, userId);
    if (!created) throw new Error("The account deletion record could not be created.");
    return created;
  },

  async claimPendingCleanup(env, limit) {
    const candidates = await env.DB.prepare(
      `SELECT user_id AS userId, storage_purged_at AS storagePurgedAt,
              auth_deleted_at AS authDeletedAt, cleanup_attempts AS cleanupAttempts,
              cleanup_lease_until AS cleanupLeaseUntil, last_error_code AS lastErrorCode
       FROM account_deletions
       WHERE auth_deleted_at IS NULL
         AND (cleanup_lease_until IS NULL OR cleanup_lease_until < ?)
       ORDER BY requested_at
       LIMIT ?`,
    )
      .bind(now(), limit)
      .all<AccountDeletionRow>();

    const claimed: AccountDeletionRecord[] = [];
    for (const row of candidates.results) {
      const lease = cleanupLeaseUntil();
      const update = await env.DB.prepare(
        `UPDATE account_deletions
         SET cleanup_lease_until = ?, cleanup_attempts = cleanup_attempts + 1
         WHERE user_id = ?
           AND auth_deleted_at IS NULL
           AND (cleanup_lease_until IS NULL OR cleanup_lease_until < ?)`,
      )
        .bind(lease, row.userId, now())
        .run();
      if ((update.meta.changes ?? 0) > 0) {
        claimed.push({
          ...toRecord(row),
          cleanupLeaseUntil: lease,
          cleanupAttempts: row.cleanupAttempts + 1,
        });
      }
    }
    return claimed;
  },

  async markStoragePurged(env, userId) {
    await env.DB.prepare(
      `UPDATE account_deletions
       SET storage_purged_at = COALESCE(storage_purged_at, ?),
           cleanup_lease_until = NULL, last_error_code = NULL
       WHERE user_id = ?`,
    )
      .bind(now(), userId)
      .run();
  },

  async markAuthDeleted(env, userId) {
    await env.DB.prepare(
      `UPDATE account_deletions
       SET auth_deleted_at = COALESCE(auth_deleted_at, ?),
           cleanup_lease_until = NULL, last_error_code = NULL
       WHERE user_id = ?`,
    )
      .bind(now(), userId)
      .run();
  },

  async releaseCleanup(env, userId, errorCode) {
    await env.DB.prepare(
      `UPDATE account_deletions
       SET cleanup_lease_until = NULL, last_error_code = ?
       WHERE user_id = ? AND auth_deleted_at IS NULL`,
    )
      .bind(errorCode, userId)
      .run();
  },
};
