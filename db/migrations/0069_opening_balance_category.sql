-- The product-owned category for a workspace's opening cash balance. It is archived so no picker
-- offers it, and income figures skip it because the amount is money the user already had. Every
-- workspace gets one, as it does at signup; the insert trigger feeds it to the mobile sync log.
-- A workspace that already has its own income category called "Opening balance" gets a distinct
-- name, because names are unique per kind.
INSERT OR IGNORE INTO `categories` (`id`, `tenant_id`, `name`, `kind`, `color`, `icon_emoji`, `system_key`, `origin`, `required_plan`, `archived`)
SELECT `id` || ':category:opening-balance', `id`,
	CASE WHEN EXISTS (
		SELECT 1 FROM `categories`
		WHERE `tenant_id` = `tenants`.`id` AND `kind` = 'income' AND `name` = 'Opening balance')
	THEN 'Opening balance (Zoption)' ELSE 'Opening balance' END,
	'income', '#6b7280', NULL, 'opening:income', 'system', 'free', 1
FROM `tenants`;
