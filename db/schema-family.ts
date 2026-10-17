import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { tenants } from "./schema";

// Family workspaces, split out of schema.ts (re-exported there) to keep it under its ceiling.
// The repositories use hand written SQL; this mirrors 0077_tenant_members.sql,
// 0078_family_spaces.sql, and 0079_family_closures.sql.

export const tenantMembers = sqliteTable(
  "tenant_members",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["owner", "member", "viewer"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    index("tenant_members_user_idx").on(table.userId),
    uniqueIndex("tenant_members_owner_unique")
      .on(table.tenantId)
      .where(sql`${table.role} = 'owner'`),
    uniqueIndex("tenant_members_owned_family_unique")
      .on(table.userId)
      .where(sql`${table.role} = 'owner'`),
    check("tenant_members_role_check", sql`${table.role} IN ('owner', 'member', 'viewer')`),
  ],
);

export const familyInvitations = sqliteTable(
  "family_invitations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["member", "viewer"] }).notNull(),
    invitedBy: text("invited_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    expiresAt: text("expires_at").notNull(),
    lastSentAt: text("last_sent_at"),
  },
  (table) => [
    uniqueIndex("family_invitations_tenant_email_unique").on(table.tenantId, table.email),
    index("family_invitations_email_idx").on(table.email),
    check("family_invitations_role_check", sql`${table.role} IN ('member', 'viewer')`),
  ],
);

export const familySeatEvents = sqliteTable(
  "family_seat_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["joined", "freed"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index("family_seat_events_tenant_idx").on(table.tenantId, table.kind, table.createdAt),
    index("family_seat_events_user_idx").on(table.userId, table.kind, table.createdAt),
    check("family_seat_events_kind_check", sql`${table.kind} IN ('joined', 'freed')`),
  ],
);

export const familyClosures = sqliteTable(
  "family_closures",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    closedBy: text("closed_by").notNull(),
    closedAt: text("closed_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [index("family_closures_purge_idx").on(table.purgeAfter)],
);
