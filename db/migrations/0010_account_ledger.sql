ALTER TABLE `accounts` ADD `system_key` text;--> statement-breakpoint
UPDATE `accounts`
SET `name` = 'Cash', `type` = 'cash', `system_key` = 'account:cash'
WHERE `id` = `tenant_id` || ':account:default';--> statement-breakpoint
INSERT OR IGNORE INTO `accounts` (`id`, `tenant_id`, `name`, `type`, `currency`, `system_key`)
SELECT `id` || ':account:bank', `id`, 'Bank', 'checking', 'PHP', 'account:bank'
FROM `tenants`;--> statement-breakpoint
INSERT OR IGNORE INTO `accounts` (`id`, `tenant_id`, `name`, `type`, `currency`, `system_key`)
SELECT `id` || ':account:gcash', `id`, 'GCash', 'other', 'PHP', 'account:gcash'
FROM `tenants`;--> statement-breakpoint
UPDATE `transactions`
SET `account_id` = `tenant_id` || ':account:default'
WHERE `account_id` IS NULL AND `kind` IN ('income', 'expense');--> statement-breakpoint
ALTER TABLE `transactions` ADD `transfer_group_id` text;--> statement-breakpoint
CREATE INDEX `transactions_tenant_transfer_group_idx` ON `transactions` (`tenant_id`,`transfer_group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_tenant_system_key_unique` ON `accounts` (`tenant_id`,`system_key`);