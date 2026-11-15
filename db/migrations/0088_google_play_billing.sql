-- Google Play joins PayPal and Dodo as a subscription provider for the Play build of the app.
-- `billing_subscriptions` pins `provider` with a CHECK constraint, which SQLite can only change by
-- rebuilding the table, and its views must be dropped first and recreated unchanged after. Every
-- column the deployed Worker reads is kept. Play purchases have no checkout reference and no
-- provider customer, so `billing_checkout_references`, `billing_customers`, and
-- `billing_webhook_events` keep their PayPal and Dodo constraint.
--
-- A Play row's `provider_subscription_id` is the purchase token, `provider_product_id` the Play
-- product, `provider_plan_id` `<product>:<base plan>`, and `last_provider_occurred_at` the last
-- time the Worker read it from Google.
DROP VIEW IF EXISTS `effective_pro_access`;
--> statement-breakpoint
DROP VIEW IF EXISTS `effective_pro_entitlements`;
--> statement-breakpoint
DROP VIEW IF EXISTS `effective_plan_access`;
--> statement-breakpoint
DROP VIEW IF EXISTS `paid_plan_subscriptions`;
--> statement-breakpoint
CREATE TABLE `billing_subscriptions_next` (
  `provider` text NOT NULL,
  `provider_subscription_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `provider_customer_id` text,
  `provider_product_id` text,
  `provider_plan_id` text NOT NULL,
  `provider_status` text NOT NULL,
  `status` text NOT NULL,
  `interval` text,
  `current_period_ends_at` text,
  `scheduled_change_at` text,
  `cancel_at_period_end` integer DEFAULT 0 NOT NULL,
  `last_provider_occurred_at` text NOT NULL,
  `last_provider_event_id` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `plan` text,
  `family_tenant_id` text,
  `entitled_plan` text,
  `entitled_until` text,
  `pending_plan` text,
  `pending_interval` text,
  PRIMARY KEY (`provider`, `provider_subscription_id`),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`provider` IN ('paypal', 'dodo', 'google_play')),
  CHECK (`cancel_at_period_end` IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `billing_subscriptions_next`
  (`provider`, `provider_subscription_id`, `tenant_id`, `provider_customer_id`,
   `provider_product_id`, `provider_plan_id`, `provider_status`, `status`, `interval`,
   `current_period_ends_at`, `scheduled_change_at`, `cancel_at_period_end`,
   `last_provider_occurred_at`, `last_provider_event_id`, `created_at`, `updated_at`,
   `plan`, `family_tenant_id`, `entitled_plan`, `entitled_until`, `pending_plan`,
   `pending_interval`)
SELECT `provider`, `provider_subscription_id`, `tenant_id`, `provider_customer_id`,
       `provider_product_id`, `provider_plan_id`, `provider_status`, `status`, `interval`,
       `current_period_ends_at`, `scheduled_change_at`, `cancel_at_period_end`,
       `last_provider_occurred_at`, `last_provider_event_id`, `created_at`, `updated_at`,
       `plan`, `family_tenant_id`, `entitled_plan`, `entitled_until`, `pending_plan`,
       `pending_interval`
FROM `billing_subscriptions`;
--> statement-breakpoint
DROP TABLE `billing_subscriptions`;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions_next` RENAME TO `billing_subscriptions`;
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_tenant_status_idx`
ON `billing_subscriptions` (`tenant_id`, `status`);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_tenant_provider_idx`
ON `billing_subscriptions` (`tenant_id`, `provider`);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_family_idx` ON `billing_subscriptions` (`family_tenant_id`)
WHERE `family_tenant_id` IS NOT NULL;
--> statement-breakpoint
-- The Play recheck reads live Play rows by when they were last read from Google.
CREATE INDEX `billing_subscriptions_google_play_recheck_idx`
ON `billing_subscriptions` (`last_provider_occurred_at`)
WHERE `provider` = 'google_play';
--> statement-breakpoint
CREATE VIEW `effective_pro_entitlements` AS
SELECT `tenant_id`, `provider` AS `source`
FROM `billing_subscriptions`
WHERE `current_period_ends_at` IS NOT NULL
  AND datetime(`current_period_ends_at`) > datetime('now')
  AND (
    `status` IN ('active', 'trialing')
    OR (`status` = 'canceled' AND `cancel_at_period_end` = 1)
  )
UNION
SELECT ut.`tenant_id`, 'platform_admin' AS `source`
FROM `user_tenants` AS ut
JOIN `platform_admin_grants` AS grant ON grant.`user_id` = ut.`user_id`
WHERE grant.`complimentary_pro_enabled` = 1
UNION
SELECT ut.`tenant_id`, 'sponsored' AS `source`
FROM `user_tenants` AS ut
JOIN `sponsored_pro_seats` AS seat ON seat.`beneficiary_user_id` = ut.`user_id`
JOIN `platform_admin_grants` AS grant ON grant.`user_id` = seat.`sponsor_user_id`
WHERE seat.`state` = 'active'
  AND grant.`complimentary_pro_enabled` = 1;
--> statement-breakpoint
CREATE VIEW `effective_pro_access` AS
SELECT `tenant_id`, `source` FROM `effective_pro_entitlements`
UNION
SELECT `tenant_id`, 'trial' AS `source`
FROM `pro_trials`
WHERE datetime(`ends_at`) > datetime('now');
--> statement-breakpoint
CREATE VIEW `paid_plan_subscriptions` AS
SELECT `tenant_id`, `provider`, `family_tenant_id`,
       MAX(
         CASE WHEN `plan` IN ('budget', 'family_budget') THEN 1 ELSE 2 END,
         CASE
           WHEN `entitled_until` IS NOT NULL AND datetime(`entitled_until`) > datetime('now')
           THEN CASE `entitled_plan`
             WHEN 'budget' THEN 1 WHEN 'family_budget' THEN 1
             WHEN 'pro' THEN 2 WHEN 'family_pro' THEN 2
             ELSE 0
           END
           ELSE 0
         END
       ) AS `rank`
FROM `billing_subscriptions`
WHERE `current_period_ends_at` IS NOT NULL
  AND datetime(`current_period_ends_at`) > datetime('now')
  AND (
    `status` IN ('active', 'trialing')
    OR (`status` = 'canceled' AND `cancel_at_period_end` = 1)
  );
--> statement-breakpoint
CREATE VIEW `effective_plan_access` AS
SELECT COALESCE(`family_tenant_id`, `tenant_id`) AS `tenant_id`,
       CASE WHEN `family_tenant_id` IS NULL THEN `provider` ELSE 'family' END AS `source`,
       `rank`, `family_tenant_id`
FROM `paid_plan_subscriptions`
UNION ALL
SELECT ut.`tenant_id`, 'family' AS `source`, paid.`rank`, paid.`family_tenant_id`
FROM `paid_plan_subscriptions` AS paid
JOIN `tenant_members` AS member ON member.`tenant_id` = paid.`family_tenant_id`
JOIN `user_tenants` AS ut ON ut.`user_id` = member.`user_id`
UNION ALL
SELECT ut.`tenant_id`, 'platform_admin' AS `source`, 2 AS `rank`, NULL AS `family_tenant_id`
FROM `user_tenants` AS ut
JOIN `platform_admin_grants` AS grant ON grant.`user_id` = ut.`user_id`
WHERE grant.`complimentary_pro_enabled` = 1
UNION ALL
SELECT ut.`tenant_id`, 'sponsored' AS `source`, 2 AS `rank`, NULL AS `family_tenant_id`
FROM `user_tenants` AS ut
JOIN `sponsored_pro_seats` AS seat ON seat.`beneficiary_user_id` = ut.`user_id`
JOIN `platform_admin_grants` AS grant ON grant.`user_id` = seat.`sponsor_user_id`
WHERE seat.`state` = 'active'
  AND grant.`complimentary_pro_enabled` = 1
UNION ALL
SELECT `tenant_id`, 'trial' AS `source`, 2 AS `rank`, NULL AS `family_tenant_id`
FROM `pro_trials`
WHERE datetime(`ends_at`) > datetime('now');
