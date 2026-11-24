-- Remembers when a workspace dismissed the Quick start guide on web or mobile, and marks
-- existing workspaces older than 7 days or already carrying established ledger activity as
-- dismissed so returning accounts do not see the tutorial again after reinstalling or switching devices.
ALTER TABLE `tenants` ADD COLUMN `quick_start_dismissed` integer DEFAULT 0 NOT NULL CHECK (`quick_start_dismissed` IN (0, 1));
UPDATE `tenants` SET `quick_start_dismissed` = 1
WHERE `created_at` <= datetime('now', '-7 days')
   OR EXISTS (SELECT 1 FROM `budgets` b WHERE b.`tenant_id` = `tenants`.`id` AND b.`limit_minor` > 0)
   OR EXISTS (SELECT 1 FROM `accounts` a WHERE a.`tenant_id` = `tenants`.`id` AND a.`deleted_at` IS NULL AND a.`system_key` IS NULL)
   OR (
     SELECT count(*) FROM `transactions` t
     JOIN `categories` c ON c.`id` = t.`category_id`
     WHERE t.`tenant_id` = `tenants`.`id`
       AND t.`deleted_at` IS NULL
       AND c.`system_key` IS NOT 'opening:income'
   ) >= 5;
