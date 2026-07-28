CREATE TABLE `account_deletions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_at` text DEFAULT (datetime('now')) NOT NULL,
	`tenant_deleted_at` text DEFAULT (datetime('now')) NOT NULL,
	`storage_purged_at` text,
	`auth_deleted_at` text,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`cleanup_lease_until` text,
	`last_error_code` text
);
--> statement-breakpoint
CREATE INDEX `account_deletions_pending_cleanup_idx` ON `account_deletions` (`auth_deleted_at`,`cleanup_lease_until`);
