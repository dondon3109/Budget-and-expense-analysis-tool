-- Family workspace membership. Personal workspaces stay in `user_tenants` (one per person);
-- this table holds only the shared workspaces (`tenants.kind = 'family'`) a person was added to.
CREATE TABLE `tenant_members` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `tenant_members_role_check` CHECK (`role` IN ('owner', 'member', 'viewer'))
);
--> statement-breakpoint
CREATE INDEX `tenant_members_user_idx` ON `tenant_members` (`user_id`);
