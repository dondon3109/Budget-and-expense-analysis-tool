import { sql } from "drizzle-orm";
import { check, index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Server push, split out of schema.ts (re-exported there) to keep it under its ceiling.
// The repository uses hand written SQL; this mirrors 0076_push.sql for the schema record.

export const pushDevices = sqliteTable(
  "push_devices",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    platform: text("platform", { enum: ["android", "ios"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    lastSeenAt: text("last_seen_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("push_devices_user_idx").on(table.userId),
    check("push_devices_platform_check", sql`${table.platform} IN ('android', 'ios')`),
  ],
);

/** A row means the person turned that category off. */
export const pushPreferences = sqliteTable(
  "push_preferences",
  {
    userId: text("user_id").notNull(),
    category: text("category").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.category] })],
);
