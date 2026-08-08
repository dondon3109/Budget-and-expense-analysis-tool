CREATE TABLE `assistant_model_memory_pass_usage` (
  `tenant_id` text PRIMARY KEY NOT NULL,
  `anchor_at_epoch` integer NOT NULL,
  `period_index` integer NOT NULL DEFAULT 0,
  `count` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `assistant_model_memory_pass_usage_anchor_nonnegative` CHECK (`anchor_at_epoch` >= 0),
  CONSTRAINT `assistant_model_memory_pass_usage_period_nonnegative` CHECK (`period_index` >= 0),
  CONSTRAINT `assistant_model_memory_pass_usage_count_range` CHECK (`count` >= 0 AND `count` <= 8)
);
--> statement-breakpoint
INSERT INTO `assistant_model_memory_pass_usage`
  (`tenant_id`, `anchor_at_epoch`, `period_index`, `count`, `updated_at`)
SELECT
  `tenant_id`,
  COALESCE(unixepoch(`created_at`), unixepoch('now')),
  MAX(
    0,
    CAST(
      (unixepoch('now') - COALESCE(unixepoch(`created_at`), unixepoch('now'))) / 1209600
      AS INTEGER
    )
  ),
  MIN(8, MAX(0, CAST(`value` AS INTEGER))),
  datetime('now')
FROM `assistant_memories`
WHERE `kind` = 'fact' AND `key` = 'model_memory_pass_count';
--> statement-breakpoint
DELETE FROM `assistant_memories` WHERE `key` = 'model_memory_pass_count';
--> statement-breakpoint
CREATE TRIGGER `assistant_model_memory_pass_anchor_immutable`
BEFORE UPDATE ON `assistant_model_memory_pass_usage`
WHEN NEW.`anchor_at_epoch` <> OLD.`anchor_at_epoch`
BEGIN
  SELECT RAISE(ABORT, 'assistant_model_memory_pass_anchor_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `assistant_model_memory_pass_period_nonregressing`
BEFORE UPDATE ON `assistant_model_memory_pass_usage`
WHEN NEW.`period_index` < OLD.`period_index`
BEGIN
  SELECT RAISE(ABORT, 'assistant_model_memory_pass_period_regression');
END;
