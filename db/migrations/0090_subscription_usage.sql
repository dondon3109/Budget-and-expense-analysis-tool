-- Subscription ROI (Pro): one "used it" check-in per subscription per day. A REST-only log that
-- never enters mobile sync, so it needs no revision or change-log triggers. Deleting a
-- subscription drops its check-ins.
CREATE TABLE `subscription_usage` (
	`tenant_id` text NOT NULL REFERENCES `tenants`(`id`) ON DELETE CASCADE,
	`subscription_id` text NOT NULL REFERENCES `subscriptions`(`id`) ON DELETE CASCADE,
	`used_on` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (`tenant_id`, `subscription_id`, `used_on`)
);
--> statement-breakpoint
-- The idle nudge sent before a renewal: one per subscription per billing date, so a retry or a
-- second cron run never sends it twice.
CREATE TABLE `subscription_usage_nudges` (
	`tenant_id` text NOT NULL REFERENCES `tenants`(`id`) ON DELETE CASCADE,
	`subscription_id` text NOT NULL REFERENCES `subscriptions`(`id`) ON DELETE CASCADE,
	`billing_date` text NOT NULL,
	`created_at` text NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (`tenant_id`, `subscription_id`, `billing_date`)
);
--> statement-breakpoint
-- "Track usage" choices. No row means the default by name (`isUsageTrackedByDefault`), so a
-- streaming service starts tracked and an electric bill or rent does not.
CREATE TABLE `subscription_usage_settings` (
	`tenant_id` text NOT NULL REFERENCES `tenants`(`id`) ON DELETE CASCADE,
	`subscription_id` text NOT NULL REFERENCES `subscriptions`(`id`) ON DELETE CASCADE,
	`tracked` integer NOT NULL CHECK (`tracked` IN (0, 1)),
	PRIMARY KEY (`tenant_id`, `subscription_id`)
);
