ALTER TABLE `categories` ADD `required_plan` text DEFAULT 'free' NOT NULL;
--> statement-breakpoint
CREATE INDEX `categories_tenant_origin_required_plan_archived_idx`
ON `categories` (`tenant_id`, `origin`, `required_plan`, `archived`);
