-- A one-time, no-card 7-day Zoption Pro trial per workspace. New workspaces get theirs at
-- bootstrap; every existing workspace without Pro gets one starting now. The `*_email_at`
-- columns record the start, ending-soon, and ended emails, which the Worker cron sends.
--
-- Trials are exposed through the new `effective_pro_access` view, which the Worker reads from
-- this release on. `effective_pro_entitlements` is left untouched so the previously deployed
-- Worker never sees a `trial` source (installed mobile apps reject it in the billing summary);
-- to that Worker a trial workspace simply looks Free. The new view builds on the old one, so an
-- entitlement change there flows through; inline the old body here before dropping it later.
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
CREATE VIEW `effective_pro_access` AS
SELECT `tenant_id`, `source` FROM `effective_pro_entitlements`
UNION
SELECT `tenant_id`, 'trial' AS `source`
FROM `pro_trials`
WHERE datetime(`ends_at`) > datetime('now');
