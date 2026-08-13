ALTER TABLE `mobile_sync_state`
	ADD COLUMN `retention_floor_sequence` integer DEFAULT 0 NOT NULL
	CHECK (`retention_floor_sequence` >= 0);
--> statement-breakpoint
CREATE TABLE `mobile_sync_clients` (
	`tenant_id` text NOT NULL,
	`client_id` text NOT NULL,
	`acknowledged_sequence` integer DEFAULT 0 NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`expires_at` text DEFAULT (datetime('now', '+90 days')) NOT NULL,
	`snapshot_sequence` integer,
	`snapshot_expires_at` text,
	PRIMARY KEY (`tenant_id`, `client_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
	CHECK (`acknowledged_sequence` >= 0),
	CHECK (`snapshot_sequence` IS NULL OR `snapshot_sequence` >= 0),
	CHECK ((`snapshot_sequence` IS NULL) = (`snapshot_expires_at` IS NULL))
);
--> statement-breakpoint
CREATE INDEX `mobile_sync_clients_expiry_idx`
	ON `mobile_sync_clients` (`tenant_id`, `expires_at`, `acknowledged_sequence`);
