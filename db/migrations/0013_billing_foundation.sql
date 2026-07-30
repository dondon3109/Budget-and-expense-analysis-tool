CREATE TABLE `billing_customers` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`paddle_customer_id` text NOT NULL,
	`email` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_paddle_customer_unique` ON `billing_customers` (`paddle_customer_id`);
--> statement-breakpoint
CREATE TABLE `billing_checkout_references` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan` text NOT NULL,
	`interval` text NOT NULL,
	`paddle_price_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_checkout_references_tenant_expiry_idx` ON `billing_checkout_references` (`tenant_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`paddle_subscription_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`paddle_customer_id` text NOT NULL,
	`paddle_product_id` text NOT NULL,
	`paddle_price_id` text NOT NULL,
	`status` text NOT NULL,
	`interval` text,
	`current_period_ends_at` text,
	`scheduled_change_at` text,
	`last_paddle_occurred_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_tenant_status_idx` ON `billing_subscriptions` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE TABLE `billing_webhook_events` (
	`paddle_event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`processed_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billing_webhook_events_occurred_idx` ON `billing_webhook_events` (`occurred_at`);
--> statement-breakpoint
CREATE TABLE `billing_monthly_usage` (
	`tenant_id` text NOT NULL,
	`month` text NOT NULL,
	`feature` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_monthly_usage_tenant_month_feature_unique` ON `billing_monthly_usage` (`tenant_id`,`month`,`feature`);