-- Budget scopes. A budget row now belongs to one period, named by its `month` key:
--   YYYY-MM-01       a specific month
--   0001-01-01       every month (the default a month falls back to)
--   occasion:<id>    one occasion, with `occasion_id` set to the calendar event it budgets
-- Keeping occasions inside `month` leaves the existing unique index and the Worker already
-- deployed untouched; only the mobile sync view below learns about `occasion_id`.
ALTER TABLE `budgets` ADD COLUMN `occasion_id` text;
--> statement-breakpoint
CREATE INDEX `budgets_tenant_occasion_idx` ON `budgets` (`tenant_id`, `occasion_id`)
WHERE `occasion_id` IS NOT NULL;
--> statement-breakpoint
DROP VIEW `mobile_sync_budget_rows`;
--> statement-breakpoint
-- An occasion row reports the every-month key as its month: clients that know occasions read
-- `occasionId`, and the month is only a placeholder.
CREATE VIEW `mobile_sync_budget_rows` AS
SELECT
	`tenant_id`,
	`id` AS `entity_id`,
	`revision` AS `row_revision`,
	`updated_at` AS `server_updated_at`,
	json_object(
		'id', `id`,
		'categoryId', `category_id`,
		'month', CASE WHEN `occasion_id` IS NULL THEN `month` ELSE '0001-01-01' END,
		'occasionId', `occasion_id`,
		'limitMinor', `limit_minor`,
		'revision', `revision`,
		'updatedAt', `updated_at`
	) AS `payload_json`
FROM `budgets`;
