ALTER TABLE `billing_monthly_usage` ADD `allowance` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `billing_monthly_usage`
SET `allowance` = CASE
  WHEN EXISTS (
    SELECT 1 FROM `billing_subscriptions`
    WHERE `billing_subscriptions`.`tenant_id` = `billing_monthly_usage`.`tenant_id`
      AND `billing_subscriptions`.`status` IN ('active', 'trialing')
  ) THEN CASE
    WHEN `feature` = 'assistant_question' THEN MAX(`count`, 100)
    ELSE MAX(`count`, 10)
  END
  ELSE CASE
    WHEN `feature` = 'assistant_question' THEN MAX(`count`, 4)
    ELSE MAX(`count`, 1)
  END
END;
--> statement-breakpoint
CREATE TRIGGER `billing_monthly_usage_limit_insert`
BEFORE INSERT ON `billing_monthly_usage`
FOR EACH ROW WHEN NEW.`count` > NEW.`allowance`
BEGIN
  SELECT RAISE(ABORT, 'billing_monthly_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `billing_monthly_usage_limit_update`
BEFORE UPDATE OF `count`, `allowance` ON `billing_monthly_usage`
FOR EACH ROW WHEN NEW.`count` > NEW.`allowance`
BEGIN
  SELECT RAISE(ABORT, 'billing_monthly_limit_reached');
END;
--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `last_paddle_event_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `billing_checkout_references` ADD `superseded_at` text;
--> statement-breakpoint
UPDATE `billing_checkout_references`
SET `superseded_at` = datetime('now'), `updated_at` = datetime('now')
WHERE `completed_at` IS NULL
  AND `id` NOT IN (
    SELECT `newest`.`id`
    FROM `billing_checkout_references` AS `newest`
    WHERE `newest`.`tenant_id` = `billing_checkout_references`.`tenant_id`
      AND `newest`.`completed_at` IS NULL
    ORDER BY `newest`.`created_at` DESC, `newest`.`id` DESC
    LIMIT 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_checkout_references_tenant_open_unique`
ON `billing_checkout_references` (`tenant_id`)
WHERE `completed_at` IS NULL AND `superseded_at` IS NULL;
