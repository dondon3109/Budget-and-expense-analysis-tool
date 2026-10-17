-- Server push. Devices and preferences belong to a person (the Supabase user id), not a
-- workspace: one person can belong to several workspaces and a notification is for them.
-- A token is unique, so a phone that signs in to another account moves to that account.
CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `push_devices_platform_check` CHECK (`platform` IN ('android', 'ios'))
);
--> statement-breakpoint
CREATE INDEX `push_devices_user_idx` ON `push_devices` (`user_id`);
--> statement-breakpoint
-- Only categories a person turned off are stored; no row means the category is on, so a
-- category added later is on for everyone without a backfill.
CREATE TABLE `push_preferences` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `category`)
);
