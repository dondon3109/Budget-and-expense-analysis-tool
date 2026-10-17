-- Comments on a family's transactions and remittances. `subject_id` has no foreign key: a
-- comment on a deleted entry stays, so it is back when the entry is restored.
CREATE TABLE `family_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "family_comments_subject_check" CHECK("family_comments"."subject_kind" IN ('transaction', 'remittance'))
);
--> statement-breakpoint
CREATE INDEX `family_comments_subject_idx` ON `family_comments` (`tenant_id`, `subject_kind`, `subject_id`, `created_at`);
--> statement-breakpoint
-- The owner's alert thresholds for one family. No row means the defaults; a null turns that
-- alert off.
CREATE TABLE `family_alert_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`spending_alert_minor` integer,
	`low_balance_minor` integer,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
