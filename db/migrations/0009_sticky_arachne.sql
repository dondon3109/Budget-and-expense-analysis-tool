CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`client_request_id` text,
	`reply_to_message_id` text,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`finish_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `assistant_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_tenant_thread_created_idx` ON `assistant_messages` (`tenant_id`,`thread_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_messages_tenant_client_request_unique` ON `assistant_messages` (`tenant_id`,`client_request_id`);--> statement-breakpoint
CREATE TABLE `assistant_preferences` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`consented_at` text,
	`retention_days` integer DEFAULT 90 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assistant_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`last_message_at` text DEFAULT (datetime('now')) NOT NULL,
	`retention_expires_at` text NOT NULL,
	`active_run_id` text,
	`active_run_expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_threads_tenant_last_message_idx` ON `assistant_threads` (`tenant_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `assistant_threads_retention_idx` ON `assistant_threads` (`retention_expires_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `currency` text DEFAULT 'PHP' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_minor` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_as_of` text;