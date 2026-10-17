-- A closed family stays readable (and exportable) by its members until `purge_after`, when the
-- daily maintenance cron deletes it. The row's presence is what makes the family read only.
CREATE TABLE `family_closures` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `family_closures_purge_idx` ON `family_closures` (`purge_after`);
