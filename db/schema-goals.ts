import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { primaryGoals, tenants } from "./schema";

// Kept in step with `goalEventNames` in packages/shared/src/goals.ts (a test checks).
const goalEventNames = [
  "onboarding_goal_shown",
  "onboarding_goal_selected",
  "onboarding_goal_skipped",
  "first_action_completed",
  "goal_changed",
] as const;

/** Goal funnel and retention events (migration 0070): fixed names and goal keys only. */
export const goalEvents = sqliteTable(
  "goal_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name", { enum: goalEventNames }).notNull(),
    goal: text("goal", { enum: primaryGoals }),
    fromGoal: text("from_goal", { enum: primaryGoals }),
    action: text("action"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("goal_events_tenant_name_idx").on(table.tenantId, table.name),
    index("goal_events_name_created_idx").on(table.name, table.createdAt),
  ],
);
