-- Paid plans become tiers: Zoption Budget and Zoption Pro, plus Family Budget and Family Pro,
-- which cover a family workspace and give every member the matching tier.
--
-- `plan` records which plan a subscription sells (budget, pro, family_budget, family_pro); every
-- earlier subscription sold Pro. A family plan is paid from its owner's personal workspace and
-- names the family it covers in `family_tenant_id`, which has no foreign key: a purged family
-- leaves the payer's row behind rather than turning it into a personal plan.
--
-- A plan change keeps a floor: until `entitled_until` the subscription grants at least
-- `entitled_plan`'s tier. A downgrade keeps the old tier to the end of the paid period, and a
-- PayPal upgrade grants the new tier before PayPal bills it. `pending_plan` and
-- `pending_interval` name the downgrade waiting for that date.
--
-- The Worker reads tiers from `effective_plan_access` from this release on. The older
-- `effective_pro_access` and `effective_pro_entitlements` views are left for the previously
-- deployed Worker and dropped in a later release.
ALTER TABLE `billing_subscriptions` ADD `plan` text;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `family_tenant_id` text;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `entitled_plan` text;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `entitled_until` text;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `pending_plan` text;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `pending_interval` text;
--> statement-breakpoint
UPDATE `billing_subscriptions` SET `plan` = 'pro' WHERE `plan` IS NULL;
--> statement-breakpoint
ALTER TABLE `billing_checkout_references` ADD `family_tenant_id` text;
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_family_idx` ON `billing_subscriptions` (`family_tenant_id`)
WHERE `family_tenant_id` IS NOT NULL;
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
-- One row per grant: rank 1 is Budget, 2 is Pro. A workspace's tier is its highest rank.
CREATE VIEW `effective_plan_access` AS
SELECT `tenant_id`, `provider` AS `source`, `rank`, NULL AS `family_tenant_id`
FROM `paid_plan_subscriptions`
WHERE `family_tenant_id` IS NULL
UNION ALL
SELECT `family_tenant_id` AS `tenant_id`, 'family' AS `source`, `rank`, `family_tenant_id`
FROM `paid_plan_subscriptions`
WHERE `family_tenant_id` IS NOT NULL
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
