ALTER TABLE `subscriptions` ADD `account_id` text REFERENCES `accounts`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_account_idx` ON `subscriptions` (`tenant_id`,`account_id`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `subscription_id` text REFERENCES `subscriptions`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX `transactions_tenant_subscription_idx` ON `transactions` (`tenant_id`,`subscription_id`);
--> statement-breakpoint
UPDATE `subscriptions` SET `account_id` = `tenant_id` || ':account:bank'
WHERE `status` = 'active' AND `account_id` IS NULL;
--> statement-breakpoint
INSERT INTO `transactions` (`id`, `tenant_id`, `account_id`, `category_id`, `date`, `description`, `amount_minor`, `currency`, `kind`, `source_kind`, `subscription_id`)
SELECT `id` || ':subscription-charge', `tenant_id`, `account_id`, `category_id`, `next_billing_date`, `name`, -(`amount_minor`), `currency`, 'expense', 'manual', `id`
FROM `subscriptions`
WHERE `status` = 'active' AND `account_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `transactions` `linked`
    WHERE `linked`.`tenant_id` = `subscriptions`.`tenant_id`
      AND `linked`.`subscription_id` = `subscriptions`.`id`
  )
  AND NOT EXISTS (
    SELECT 1 FROM `transactions` `manual_tx`
    WHERE `manual_tx`.`tenant_id` = `subscriptions`.`tenant_id`
      AND `manual_tx`.`date` = `subscriptions`.`next_billing_date`
      AND `manual_tx`.`description` = `subscriptions`.`name`
      AND `manual_tx`.`amount_minor` = -(`subscriptions`.`amount_minor`)
      AND `manual_tx`.`kind` = 'expense'
      AND `manual_tx`.`subscription_id` IS NULL
  );