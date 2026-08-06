ALTER TABLE `accounts` ADD `interest_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `annual_rate_basis_points` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `interest_frequency` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `interest_pay_day` integer;--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX `accounts_tenant_interest_idx` ON `accounts` (`tenant_id`,`interest_enabled`);
--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `archived`, `system_key`, `origin`, `required_plan`)
SELECT `id` || ':category:interest', `id`, 'Interest', 'income', '#22c55e', 0, 'interest:income', 'system', 'free'
FROM `tenants`
WHERE NOT EXISTS (
  SELECT 1 FROM `categories`
  WHERE `categories`.`tenant_id` = `tenants`.`id`
    AND `categories`.`system_key` = 'interest:income'
);
