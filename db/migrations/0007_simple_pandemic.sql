DROP INDEX `categories_tenant_name_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `system_key` text;--> statement-breakpoint
UPDATE `categories`
SET
	`name` = 'Uncategorized',
	`archived` = 0,
	`system_key` = 'uncategorized:' || `kind`,
	`updated_at` = datetime('now')
WHERE `id` IN (
	SELECT candidate.`id`
	FROM `categories` candidate
	WHERE lower(trim(candidate.`name`)) = 'uncategorized'
		AND candidate.`id` = (
			SELECT existing.`id`
			FROM `categories` existing
			WHERE existing.`tenant_id` = candidate.`tenant_id`
				AND existing.`kind` = candidate.`kind`
				AND lower(trim(existing.`name`)) = 'uncategorized'
			ORDER BY CASE WHEN existing.`name` = 'Uncategorized' THEN 0 ELSE 1 END,
				existing.`created_at`,
				existing.`id`
			LIMIT 1
		)
);--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `archived`, `system_key`)
SELECT
	`id` || ':category:uncategorized-income',
	`id`,
	'Uncategorized',
	'income',
	'#6b7280',
	0,
	'uncategorized:income'
FROM `tenants`
WHERE NOT EXISTS (
	SELECT 1 FROM `categories`
	WHERE `categories`.`tenant_id` = `tenants`.`id`
		AND `categories`.`system_key` = 'uncategorized:income'
);--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `archived`, `system_key`)
SELECT
	`id` || ':category:uncategorized-expense',
	`id`,
	'Uncategorized',
	'expense',
	'#6b7280',
	0,
	'uncategorized:expense'
FROM `tenants`
WHERE NOT EXISTS (
	SELECT 1 FROM `categories`
	WHERE `categories`.`tenant_id` = `tenants`.`id`
		AND `categories`.`system_key` = 'uncategorized:expense'
);--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `archived`, `system_key`)
SELECT
	`id` || ':category:uncategorized-transfer',
	`id`,
	'Uncategorized',
	'transfer',
	'#6b7280',
	0,
	'uncategorized:transfer'
FROM `tenants`
WHERE NOT EXISTS (
	SELECT 1 FROM `categories`
	WHERE `categories`.`tenant_id` = `tenants`.`id`
		AND `categories`.`system_key` = 'uncategorized:transfer'
);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_tenant_kind_name_unique` ON `categories` (`tenant_id`,`kind`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_tenant_system_key_unique` ON `categories` (`tenant_id`,`system_key`);