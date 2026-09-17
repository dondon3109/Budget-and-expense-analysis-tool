-- Recurring subscriptions post one charge per billing cycle. This table records the
-- single email sent the first time a cycle cannot be charged because its linked
-- account cannot cover it, so the daily retries that follow stay silent.
CREATE TABLE `subscription_renewal_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`due_date` text NOT NULL,
	`subscription_name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`account_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` text,
	`last_error_code` text,
	`sent_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_renewal_notifications_cycle_unique` ON `subscription_renewal_notifications` (`subscription_id`,`due_date`);
--> statement-breakpoint
CREATE INDEX `subscription_renewal_notifications_retry_idx` ON `subscription_renewal_notifications` (`status`,`lease_until`,`attempts`);
--> statement-breakpoint
CREATE INDEX `subscriptions_status_next_billing_idx` ON `subscriptions` (`status`,`next_billing_date`);
