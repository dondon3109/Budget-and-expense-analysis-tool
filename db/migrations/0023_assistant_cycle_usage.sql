CREATE TABLE `billing_assistant_cycle_usage` (
  `tenant_id` text PRIMARY KEY NOT NULL,
  `anchor_at_epoch` integer NOT NULL,
  `period_index` integer NOT NULL DEFAULT 0,
  `count` integer NOT NULL DEFAULT 0,
  `allowance` integer NOT NULL,
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `billing_assistant_cycle_usage_anchor_nonnegative` CHECK (`anchor_at_epoch` >= 0),
  CONSTRAINT `billing_assistant_cycle_usage_period_nonnegative` CHECK (`period_index` >= 0),
  CONSTRAINT `billing_assistant_cycle_usage_count_nonnegative` CHECK (`count` >= 0),
  CONSTRAINT `billing_assistant_cycle_usage_allowance_positive` CHECK (`allowance` > 0)
);
--> statement-breakpoint
CREATE TRIGGER `billing_assistant_cycle_limit_insert`
BEFORE INSERT ON `billing_assistant_cycle_usage`
WHEN NEW.`count` > NEW.`allowance`
BEGIN
  SELECT RAISE(ABORT, 'billing_assistant_cycle_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `billing_assistant_cycle_limit_update`
BEFORE UPDATE ON `billing_assistant_cycle_usage`
WHEN NEW.`count` > NEW.`allowance`
BEGIN
  SELECT RAISE(ABORT, 'billing_assistant_cycle_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER `billing_assistant_cycle_anchor_immutable`
BEFORE UPDATE ON `billing_assistant_cycle_usage`
WHEN NEW.`anchor_at_epoch` <> OLD.`anchor_at_epoch`
BEGIN
  SELECT RAISE(ABORT, 'billing_assistant_cycle_anchor_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `billing_assistant_cycle_period_nonregressing`
BEFORE UPDATE ON `billing_assistant_cycle_usage`
WHEN NEW.`period_index` < OLD.`period_index`
BEGIN
  SELECT RAISE(ABORT, 'billing_assistant_cycle_period_regression');
END;
