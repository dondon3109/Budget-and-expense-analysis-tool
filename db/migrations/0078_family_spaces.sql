-- One owner per family, and a person owns at most one family.
CREATE UNIQUE INDEX `tenant_members_owner_unique` ON `tenant_members` (`tenant_id`) WHERE `role` = 'owner';
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_members_owned_family_unique` ON `tenant_members` (`user_id`) WHERE `role` = 'owner';
--> statement-breakpoint
-- An invitation reserves a seat until it is accepted, declined, revoked, or expires. It is
-- addressed to an email and accepted only by the person whose verified email matches.
CREATE TABLE `family_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`role` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`last_sent_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `family_invitations_role_check` CHECK (`role` IN ('member', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_invitations_tenant_email_unique` ON `family_invitations` (`tenant_id`, `email`);
--> statement-breakpoint
CREATE INDEX `family_invitations_email_idx` ON `family_invitations` (`email`);
--> statement-breakpoint
-- Joins and departures, kept for the anti-resale rules (seat cooldown, join cooldown, yearly
-- swap cap). No foreign key: the join cooldown must outlive a closed family.
CREATE TABLE `family_seat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `family_seat_events_kind_check` CHECK (`kind` IN ('joined', 'freed'))
);
--> statement-breakpoint
CREATE INDEX `family_seat_events_tenant_idx` ON `family_seat_events` (`tenant_id`, `kind`, `created_at`);
--> statement-breakpoint
CREATE INDEX `family_seat_events_user_idx` ON `family_seat_events` (`user_id`, `kind`, `created_at`);
