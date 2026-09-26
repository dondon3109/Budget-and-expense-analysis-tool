-- A one-time, no-card 7-day Zoption Pro trial per workspace. New workspaces get theirs at
-- bootstrap; every existing workspace without Pro gets one starting now. The `*_email_at`
-- columns record the start, ending-soon, and ended emails, which the Worker cron sends.
--
-- The view gains a `trial` source. The previous Worker returns that value as-is in the billing
-- summary, which installed mobile apps reject, so until the new Worker is live a trial-only
-- workspace sees a billing screen error on mobile. Entitlement checks are unaffected.
CREATE TABLE `pro_trials` (
  `tenant_id` text PRIMARY KEY NOT NULL,
  `started_at` text NOT NULL,
  `ends_at` text NOT NULL,
  `started_email_at` text,
  `ending_email_at` text,
  `ended_email_at` text,
  `email_failures` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pro_trials_pending_email_idx` ON `pro_trials` (`ends_at`)
WHERE `ended_email_at` IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `pro_trials` (`tenant_id`, `started_at`, `ends_at`)
SELECT `id`,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days')
FROM `tenants`
WHERE `kind` = 'user'
  AND `id` NOT IN (SELECT `tenant_id` FROM `effective_pro_entitlements`);
--> statement-breakpoint
DROP VIEW IF EXISTS `effective_pro_entitlements`;
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
  AND grant.`complimentary_pro_enabled` = 1
UNION
SELECT `tenant_id`, 'trial' AS `source`
FROM `pro_trials`
WHERE datetime(`ends_at`) > datetime('now');
