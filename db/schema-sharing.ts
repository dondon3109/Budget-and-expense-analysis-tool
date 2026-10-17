import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { tenants } from "./schema";

// Public share links, split out of schema.ts (re-exported there) to keep it under its ceiling.
// The repository uses hand written SQL; this mirrors 0075_share_links.sql for the schema record.

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull(),
    /** SHA-256 hex of the link token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    kind: text("kind", { enum: ["transaction", "balance"] }).notNull(),
    sourceId: text("source_id").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    sharerName: text("sharer_name"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_unique").on(table.tokenHash),
    index("share_links_tenant_created_idx").on(table.tenantId, table.createdAt),
    check("share_links_kind_check", sql`${table.kind} IN ('transaction', 'balance')`),
  ],
);
