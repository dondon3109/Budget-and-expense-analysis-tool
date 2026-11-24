import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Kept in step with `primaryGoals` in packages/shared/src/goals.ts (a test checks).
export const primaryGoals = [
  "track_spending",
  "build_budget",
  "save_for_goal",
  "reduce_debt",
  "understand_habits",
  "just_exploring",
  "other",
] as const;

// Kept in step with `incomeCadences` and `budgetingStyles` in packages/shared/src/preferences.ts
// (a test checks).
export const incomeCadences = ["monthly", "semi_monthly", "weekly", "irregular"] as const;
export const budgetingStyles = [
  "category_limits",
  "fifty_thirty_twenty",
  "zero_based",
  "not_sure",
] as const;

export const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["user", "family"] }).notNull(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("PHP"),
  primaryGoal: text("primary_goal", { enum: primaryGoals }),
  goalSelectedAt: text("goal_selected_at"),
  goalSkipped: integer("goal_skipped", { mode: "boolean" }).notNull().default(false),
  goalOtherText: text("goal_other_text"),
  secondaryGoals: text("secondary_goals").notNull().default("[]"),
  incomeCadence: text("income_cadence", { enum: incomeCadences }),
  budgetingStyle: text("budgeting_style", { enum: budgetingStyles }),
  spendingFocus: text("spending_focus").notNull().default("[]"),
  quickStartDismissed: integer("quick_start_dismissed", { mode: "boolean" })
    .notNull()
    .default(false),
  ...timestamps,
});
