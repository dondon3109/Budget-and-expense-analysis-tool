-- Goal-based onboarding: why the user came to Zoption. Every column is nullable or defaulted so
-- existing workspaces and users who skip keep working untouched; nobody is backfilled and nobody is
-- sent back through onboarding. `goal_other_text` holds the optional 140 character answer for 'other'.
ALTER TABLE `tenants` ADD COLUMN `primary_goal` text CHECK (`primary_goal` IS NULL OR `primary_goal` IN ('track_spending', 'build_budget', 'save_for_goal', 'reduce_debt', 'understand_habits', 'just_exploring', 'other'));
--> statement-breakpoint
ALTER TABLE `tenants` ADD COLUMN `goal_selected_at` text;
--> statement-breakpoint
ALTER TABLE `tenants` ADD COLUMN `goal_skipped` integer DEFAULT 0 NOT NULL CHECK (`goal_skipped` IN (0, 1));
--> statement-breakpoint
ALTER TABLE `tenants` ADD COLUMN `goal_other_text` text CHECK (`goal_other_text` IS NULL OR length(`goal_other_text`) <= 140);
--> statement-breakpoint
-- Goal funnel and retention events. A row holds a tenant id, a fixed event name, and goal keys only:
-- no free text, amounts, or identity beyond the tenant it is deleted with.
CREATE TABLE `goal_events` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL CHECK (`name` IN ('onboarding_goal_shown', 'onboarding_goal_selected', 'onboarding_goal_skipped', 'first_action_completed', 'goal_changed')),
  `goal` text,
  `from_goal` text,
  `action` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goal_events_tenant_name_idx` ON `goal_events` (`tenant_id`, `name`);
--> statement-breakpoint
CREATE INDEX `goal_events_name_created_idx` ON `goal_events` (`name`, `created_at`);
