-- A debt payment is an expense, so it needs a category to sit in, plus a link to the
-- debt the money went to. Deleting a debt keeps its ledger history and clears the link.
ALTER TABLE `transactions` ADD COLUMN `debt_id` TEXT REFERENCES `debts`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
-- Every workspace that already exists gets the category; the id matches the key the
-- bootstrap uses for new workspaces. Workspaces that already made their own category
-- with this name keep it, so the per-kind name index stays intact.
INSERT INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `icon_emoji`, `origin`, `required_plan`, `system_key`)
SELECT `tenants`.`id` || ':category:debt-payment',
	`tenants`.`id`,
	'Debt payment',
	'expense',
	'#e34948',
	'🏦',
	'system',
	'free',
	'debt:expense'
FROM `tenants`
WHERE NOT EXISTS (
	SELECT 1 FROM `categories`
	WHERE `categories`.`tenant_id` = `tenants`.`id`
		AND `categories`.`kind` = 'expense'
		AND lower(`categories`.`name`) = 'debt payment'
);
