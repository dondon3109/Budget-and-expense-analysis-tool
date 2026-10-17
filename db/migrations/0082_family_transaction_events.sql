-- The append-only history of a family's transactions: who changed or deleted an entry, when,
-- and what it looked like before and after. A delete also keeps the raw rows in
-- `snapshot_json`, which is how the owner restores an entry within the restore window.
CREATE TABLE `family_transaction_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`snapshot_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "family_transaction_events_action_check" CHECK("family_transaction_events"."action" IN ('updated', 'deleted', 'restored'))
);
--> statement-breakpoint
CREATE INDEX `family_transaction_events_entry_idx` ON `family_transaction_events` (`tenant_id`, `transaction_id`, `id`);
--> statement-breakpoint
CREATE INDEX `family_transaction_events_deleted_idx` ON `family_transaction_events` (`tenant_id`, `action`, `created_at`);
