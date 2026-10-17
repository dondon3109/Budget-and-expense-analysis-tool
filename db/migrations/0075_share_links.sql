-- Public share links. Each row is a frozen JSON snapshot of the fields the owner chose to show;
-- the public read returns `snapshot_json` and nothing else, so a link can never reach the
-- workspace behind it. Only the SHA-256 of the link token is stored, so the table alone cannot
-- open a link. Revoking deletes the row. `source_id` (the transaction or account) is kept only
-- so the owner can see what a link points at; the public read never uses it.
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`sharer_name` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `share_links_kind_check` CHECK (`kind` IN ('transaction', 'balance'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_hash_unique` ON `share_links` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `share_links_tenant_created_idx` ON `share_links` (`tenant_id`, `created_at`);
