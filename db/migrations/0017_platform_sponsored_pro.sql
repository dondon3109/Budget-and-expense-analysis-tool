CREATE TABLE `platform_admin_grants` (
  `user_id` text PRIMARY KEY NOT NULL,
  `complimentary_pro_enabled` integer DEFAULT 1 NOT NULL,
  `disabled_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  CHECK (`complimentary_pro_enabled` IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `app_user_identities` (
  `user_id` text PRIMARY KEY NOT NULL,
  `verified_email` text COLLATE NOCASE NOT NULL,
  `verified_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_identities_verified_email_unique`
ON `app_user_identities` (`verified_email`);
--> statement-breakpoint
CREATE TABLE `sponsored_pro_seats` (
  `sponsor_user_id` text NOT NULL,
  `slot_number` integer NOT NULL,
  `state` text DEFAULT 'empty' NOT NULL,
  `pending_email` text COLLATE NOCASE,
  `beneficiary_user_id` text,
  `invited_at` text,
  `invite_last_sent_at` text,
  `invite_send_lease_until` text,
  `assigned_at` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  PRIMARY KEY (`sponsor_user_id`, `slot_number`),
  FOREIGN KEY (`sponsor_user_id`) REFERENCES `platform_admin_grants`(`user_id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`slot_number` BETWEEN 1 AND 5),
  CHECK (`state` IN ('empty', 'pending', 'active')),
  CHECK (
    (`state` = 'empty' AND `pending_email` IS NULL AND `beneficiary_user_id` IS NULL AND `assigned_at` IS NULL)
    OR (`state` = 'pending' AND `pending_email` IS NOT NULL AND `beneficiary_user_id` IS NULL AND `assigned_at` IS NULL)
    OR (`state` = 'active' AND `pending_email` IS NULL AND `beneficiary_user_id` IS NOT NULL AND `assigned_at` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsored_pro_seats_active_beneficiary_unique`
ON `sponsored_pro_seats` (`beneficiary_user_id`)
WHERE `state` = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsored_pro_seats_pending_email_unique`
ON `sponsored_pro_seats` (`pending_email`)
WHERE `state` = 'pending';
--> statement-breakpoint
CREATE INDEX `sponsored_pro_seats_sponsor_state_idx`
ON `sponsored_pro_seats` (`sponsor_user_id`, `state`);
--> statement-breakpoint
INSERT OR IGNORE INTO `platform_admin_grants` (`user_id`, `complimentary_pro_enabled`)
VALUES ('08060c19-8a55-4046-a2e7-7384808dd81c', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO `sponsored_pro_seats` (`sponsor_user_id`, `slot_number`)
VALUES
  ('08060c19-8a55-4046-a2e7-7384808dd81c', 1),
  ('08060c19-8a55-4046-a2e7-7384808dd81c', 2),
  ('08060c19-8a55-4046-a2e7-7384808dd81c', 3),
  ('08060c19-8a55-4046-a2e7-7384808dd81c', 4),
  ('08060c19-8a55-4046-a2e7-7384808dd81c', 5);
--> statement-breakpoint
CREATE VIEW `effective_pro_entitlements` AS
SELECT `tenant_id`, 'paddle' AS `source`
FROM `billing_subscriptions`
WHERE `status` IN ('active', 'trialing')
  AND `current_period_ends_at` IS NOT NULL
  AND datetime(`current_period_ends_at`) > datetime('now')
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
