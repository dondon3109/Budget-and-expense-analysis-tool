import { sql } from "drizzle-orm";
import { check, index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { tenants } from "./schema";

// Family workspaces, split out of schema.ts (re-exported there) to keep it under its ceiling.
// The repositories use hand written SQL; this mirrors 0077_tenant_members.sql.

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
    check("tenant_members_role_check", sql`${table.role} IN ('owner', 'member', 'viewer')`),
  ],
);
