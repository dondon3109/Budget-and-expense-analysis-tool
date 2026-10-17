import {
  manilaDate,
  shareSnapshotSchema,
  type PublicShareLink,
  type ShareLink,
  type ShareLinkCreateInput,
  type ShareLinkExpiry,
  type ShareSnapshot,
} from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";
import type { AccountRepository } from "./accounts";

const EXPIRY_MS: Record<Exclude<ShareLinkExpiry, "never">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export interface CreatedShareLink {
  id: string;
  token: string;
  snapshot: ShareSnapshot;
  sharerName: string | null;
  expiresAt: string | null;
}

/**
 * Public share links. `create` and the owner methods are tenant scoped; `readPublic` is the one
 * unauthenticated read and resolves a link only by the hash of its token.
 */
export interface ShareLinkRepository {
  create(
    env: Bindings,
    tenantId: string,
    userId: string,
    input: ShareLinkCreateInput,
  ): Promise<CreatedShareLink>;
  list(env: Bindings, tenantId: string): Promise<ShareLink[]>;
  revoke(env: Bindings, tenantId: string, id: string): Promise<void>;
  readPublic(env: Bindings, token: string): Promise<PublicShareLink | null>;
}

interface ShareLinkRow {
  id: string;
  kind: ShareLink["kind"];
  snapshotJson: string;
  sharerName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface TransactionRow {
  amountMinor: number;
  currency: string;
  kind: "income" | "expense" | "transfer";
  date: string;
  description: string;
  notes: string | null;
  categoryName: string;
}

/** 128 random bits, base64url: unguessable and short enough to paste into a chat. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function expiresAtFor(expiry: ShareLinkExpiry, now: Date): string | null {
  if (expiry === "never") return null;
  return new Date(now.getTime() + EXPIRY_MS[expiry]).toISOString();
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function transactionSnapshot(
  env: Bindings,
  tenantId: string,
  input: Extract<ShareLinkCreateInput, { kind: "transaction" }>,
): Promise<ShareSnapshot> {
  const row = await env.DB.prepare(
    `SELECT t.amount_minor AS amountMinor, t.currency, t.kind, t.date, t.description, t.notes,
       c.name AS categoryName
     FROM transactions t JOIN categories c ON c.id = t.category_id AND c.tenant_id = t.tenant_id
     WHERE t.tenant_id = ? AND t.id = ? AND t.deleted_at IS NULL`,
  )
    .bind(tenantId, input.transactionId)
    .first<TransactionRow>();
  if (!row) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
  // A transfer is two legs with opposite signs; one leg alone would misstate it.
  if (row.kind === "transfer") {
    throw new HttpError(400, "share_unsupported", "Transfers can't be shared yet.");
  }
  return shareSnapshotSchema.parse({
    kind: "transaction",
    direction: row.kind,
    amountMinor: Math.abs(row.amountMinor),
    currency: row.currency,
    description: input.show.description ? blankToNull(row.description) : null,
    categoryName: input.show.category ? row.categoryName : null,
    date: input.show.date ? row.date : null,
    note: input.show.note ? blankToNull(row.notes) : null,
  });
}

async function balanceSnapshot(
  env: Bindings,
  tenantId: string,
  accounts: AccountRepository,
  accountId: string,
): Promise<ShareSnapshot> {
  // The same balance the app shows for the account, in the account's own currency.
  const account = (await accounts.list(env, tenantId)).find((item) => item.id === accountId);
  if (!account) throw new HttpError(404, "account_not_found", "Account not found.");
  return shareSnapshotSchema.parse({
    kind: "balance",
    amountMinor: account.balanceMinor ?? 0,
    currency: account.currency,
    asOf: manilaDate(),
  });
}

function toShareLink(row: ShareLinkRow): ShareLink {
  return {
    id: row.id,
    kind: row.kind,
    snapshot: shareSnapshotSchema.parse(JSON.parse(row.snapshotJson)),
    sharerName: row.sharerName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

const selectColumns = `id, kind, snapshot_json AS snapshotJson, sharer_name AS sharerName,
  created_at AS createdAt, expires_at AS expiresAt`;

// Expiry is an ISO timestamp, so it compares as text against the same format.
const notExpired = "(expires_at IS NULL OR expires_at > ?)";

export function createShareLinkRepository(accounts: AccountRepository): ShareLinkRepository {
  return {
    async create(env, tenantId, userId, input) {
      const snapshot =
        input.kind === "transaction"
          ? await transactionSnapshot(env, tenantId, input)
          : await balanceSnapshot(env, tenantId, accounts, input.accountId);
      const now = new Date();
      const id = crypto.randomUUID();
      const token = newToken();
      const expiresAt = expiresAtFor(input.expiry, now);
      const sharerName = blankToNull(input.sharerName);
      await env.DB.prepare(
        `INSERT INTO share_links
           (id, tenant_id, created_by_user_id, token_hash, kind, source_id, snapshot_json,
            sharer_name, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          tenantId,
          userId,
          await hashToken(token),
          input.kind,
          input.kind === "transaction" ? input.transactionId : input.accountId,
          JSON.stringify(snapshot),
          sharerName,
          expiresAt,
          now.toISOString(),
        )
        .run();
      return { id, token, snapshot, sharerName, expiresAt };
    },

    async list(env, tenantId) {
      const { results } = await env.DB.prepare(
        `SELECT ${selectColumns} FROM share_links
         WHERE tenant_id = ? AND ${notExpired}
         ORDER BY created_at DESC`,
      )
        .bind(tenantId, new Date().toISOString())
        .all<ShareLinkRow>();
      return results.map(toShareLink);
    },

    async revoke(env, tenantId, id) {
      const result = await env.DB.prepare("DELETE FROM share_links WHERE tenant_id = ? AND id = ?")
        .bind(tenantId, id)
        .run();
      if (!result.meta.changes) {
        throw new HttpError(404, "share_link_not_found", "Share link not found.");
      }
    },

    async readPublic(env, token) {
      const row = await env.DB.prepare(
        `SELECT ${selectColumns} FROM share_links WHERE token_hash = ? AND ${notExpired}`,
      )
        .bind(await hashToken(token), new Date().toISOString())
        .first<ShareLinkRow>();
      if (!row) return null;
      const { snapshot, sharerName, createdAt, expiresAt } = toShareLink(row);
      return { snapshot, sharerName, createdAt, expiresAt };
    },
  };
}
