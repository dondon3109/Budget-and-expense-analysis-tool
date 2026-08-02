CREATE TABLE IF NOT EXISTS `_billing_paypal_only_migration_guard` (
  `blocking_paddle_subscription_count` integer NOT NULL,
  CHECK (`blocking_paddle_subscription_count` = 0)
);
--> statement-breakpoint
DELETE FROM `_billing_paypal_only_migration_guard`;
--> statement-breakpoint
INSERT INTO `_billing_paypal_only_migration_guard` (`blocking_paddle_subscription_count`)
SELECT COUNT(*)
FROM `billing_subscriptions`
WHERE `provider` = 'paddle'
  AND (
    `status` IN ('active', 'trialing', 'past_due', 'paused')
    OR (
      `current_period_ends_at` IS NOT NULL
      AND datetime(`current_period_ends_at`) > datetime('now')
    )
  );
--> statement-breakpoint
DROP TABLE `_billing_paypal_only_migration_guard`;
--> statement-breakpoint
DROP VIEW IF EXISTS `effective_pro_entitlements`;
--> statement-breakpoint
CREATE TABLE `billing_customers_paypal` (
  `tenant_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_customer_id` text,
  `email` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  PRIMARY KEY (`tenant_id`, `provider`),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`provider` = 'paypal')
);
--> statement-breakpoint
CREATE TABLE `billing_checkout_references_paypal` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `provider` text NOT NULL,
  `plan` text NOT NULL,
  `interval` text NOT NULL,
  `provider_plan_id` text NOT NULL,
  `provider_subscription_id` text,
  `expires_at` text NOT NULL,
  `completed_at` text,
  `superseded_at` text,
  `last_reconciled_at` text,
  `reconciliation_attempts` integer DEFAULT 0 NOT NULL,
  `last_provider_status` text,
  `last_reconciliation_error` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`provider` = 'paypal')
);
--> statement-breakpoint
CREATE TABLE `billing_subscriptions_paypal` (
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
  PRIMARY KEY (`provider`, `provider_subscription_id`),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`provider` = 'paypal'),
  CHECK (`cancel_at_period_end` IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `billing_webhook_events_paypal` (
  `provider` text NOT NULL,
  `provider_event_id` text NOT NULL,
  `event_type` text NOT NULL,
  `occurred_at` text NOT NULL,
  `processed_at` text DEFAULT (datetime('now')) NOT NULL,
  PRIMARY KEY (`provider`, `provider_event_id`),
  CHECK (`provider` = 'paypal')
);
--> statement-breakpoint
INSERT INTO `billing_customers_paypal`
  (`tenant_id`, `provider`, `provider_customer_id`, `email`, `created_at`, `updated_at`)
SELECT `tenant_id`, `provider`, `provider_customer_id`, `email`, `created_at`, `updated_at`
FROM `billing_customers`
WHERE `provider` = 'paypal';
--> statement-breakpoint
INSERT INTO `billing_checkout_references_paypal`
  (`id`, `tenant_id`, `provider`, `plan`, `interval`, `provider_plan_id`,
   `provider_subscription_id`, `expires_at`, `completed_at`, `superseded_at`,
   `created_at`, `updated_at`)
SELECT `id`, `tenant_id`, `provider`, `plan`, `interval`, `provider_plan_id`,
       `provider_subscription_id`, `expires_at`, `completed_at`, `superseded_at`,
       `created_at`, `updated_at`
FROM `billing_checkout_references`
WHERE `provider` = 'paypal';
--> statement-breakpoint
INSERT INTO `billing_subscriptions_paypal`
  (`provider`, `provider_subscription_id`, `tenant_id`, `provider_customer_id`,
   `provider_product_id`, `provider_plan_id`, `provider_status`, `status`, `interval`,
   `current_period_ends_at`, `scheduled_change_at`, `cancel_at_period_end`,
   `last_provider_occurred_at`, `last_provider_event_id`, `created_at`, `updated_at`)
SELECT `provider`, `provider_subscription_id`, `tenant_id`, `provider_customer_id`,
       `provider_product_id`, `provider_plan_id`, `provider_status`, `status`, `interval`,
       `current_period_ends_at`, `scheduled_change_at`, `cancel_at_period_end`,
       `last_provider_occurred_at`, `last_provider_event_id`, `created_at`, `updated_at`
FROM `billing_subscriptions`
WHERE `provider` = 'paypal';
--> statement-breakpoint
INSERT INTO `billing_webhook_events_paypal`
  (`provider`, `provider_event_id`, `event_type`, `occurred_at`, `processed_at`)
SELECT `provider`, `provider_event_id`, `event_type`, `occurred_at`, `processed_at`
FROM `billing_webhook_events`
WHERE `provider` = 'paypal';
--> statement-breakpoint
DROP TABLE `billing_customers`;
--> statement-breakpoint
DROP TABLE `billing_checkout_references`;
--> statement-breakpoint
DROP TABLE `billing_subscriptions`;
--> statement-breakpoint
DROP TABLE `billing_webhook_events`;
--> statement-breakpoint
ALTER TABLE `billing_customers_paypal` RENAME TO `billing_customers`;
--> statement-breakpoint
ALTER TABLE `billing_checkout_references_paypal` RENAME TO `billing_checkout_references`;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions_paypal` RENAME TO `billing_subscriptions`;
--> statement-breakpoint
ALTER TABLE `billing_webhook_events_paypal` RENAME TO `billing_webhook_events`;
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customers_provider_customer_unique`
ON `billing_customers` (`provider`, `provider_customer_id`)
WHERE `provider_customer_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `billing_checkout_references_tenant_expiry_idx`
ON `billing_checkout_references` (`tenant_id`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `billing_checkout_references_reconciliation_idx`
ON `billing_checkout_references` (`last_reconciled_at`, `created_at`)
WHERE `completed_at` IS NULL AND `superseded_at` IS NULL
  AND `provider_subscription_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_references_tenant_open_unique`
ON `billing_checkout_references` (`tenant_id`)
WHERE `completed_at` IS NULL AND `superseded_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_tenant_status_idx`
ON `billing_subscriptions` (`tenant_id`, `status`);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_tenant_provider_idx`
ON `billing_subscriptions` (`tenant_id`, `provider`);
--> statement-breakpoint
CREATE INDEX `billing_webhook_events_occurred_idx`
ON `billing_webhook_events` (`occurred_at`);
--> statement-breakpoint
CREATE VIEW `effective_pro_entitlements` AS
SELECT `tenant_id`, 'paypal' AS `source`
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
