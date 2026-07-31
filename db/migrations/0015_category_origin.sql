ALTER TABLE `categories` ADD `origin` text DEFAULT 'custom' NOT NULL;
--> statement-breakpoint
UPDATE `categories`
SET `origin` = 'system'
WHERE `system_key` IS NOT NULL;
--> statement-breakpoint
UPDATE `categories`
SET `origin` = 'starter'
WHERE `system_key` IS NULL
  AND `id` IN (
    `tenant_id` || ':category:salary',
    `tenant_id` || ':category:housing',
    `tenant_id` || ':category:food',
    `tenant_id` || ':category:transport',
    `tenant_id` || ':category:utilities',
    `tenant_id` || ':category:leisure',
    `tenant_id` || ':category:savings-transfer'
  );
--> statement-breakpoint
CREATE INDEX `categories_tenant_origin_archived_idx`
ON `categories` (`tenant_id`, `origin`, `archived`);
