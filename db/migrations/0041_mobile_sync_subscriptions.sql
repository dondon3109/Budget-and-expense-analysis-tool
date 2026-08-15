ALTER TABLE `subscriptions` ADD `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` > 0);
--> statement-breakpoint
DROP TRIGGER `accounts_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `accounts_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `accounts_mobile_sync_delete`;
--> statement-breakpoint
DROP TRIGGER `categories_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `categories_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `categories_mobile_sync_delete`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_delete`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_explicit_revision_update`;
--> statement-breakpoint
DROP TRIGGER `budgets_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `budgets_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `financial_goals_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `financial_goals_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `financial_goals_mobile_sync_delete`;
DROP TRIGGER `debts_mobile_sync_insert`;
DROP TRIGGER `debts_mobile_sync_update`;
DROP TRIGGER `debts_mobile_sync_delete`;
--> statement-breakpoint
CREATE TABLE `mobile_sync_changes_new` (
	`tenant_id` text NOT NULL,
	`sequence` integer NOT NULL CHECK (`sequence` > 0),
	`entity_type` text NOT NULL CHECK (`entity_type` IN ('account', 'category', 'transaction', 'budget', 'goal', 'debt', 'subscription')),
	`entity_id` text NOT NULL,
	`row_revision` integer NOT NULL CHECK (`row_revision` > 0),
	`operation` text NOT NULL CHECK (`operation` IN ('upsert', 'delete')),
	`payload_json` text,
	`server_updated_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `sequence`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (
		(`operation` = 'upsert' AND `payload_json` IS NOT NULL)
		OR (`operation` = 'delete' AND `payload_json` IS NULL)
	)
);
--> statement-breakpoint
CREATE TABLE `mobile_sync_change_groups_new` (
	`tenant_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`atomic_group_id` text NOT NULL,
	PRIMARY KEY (`tenant_id`, `sequence`),
	FOREIGN KEY (`tenant_id`, `sequence`)
		REFERENCES `mobile_sync_changes_new` (`tenant_id`, `sequence`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `mobile_sync_changes_new` (`tenant_id`, `sequence`, `entity_type`, `entity_id`, `row_revision`, `operation`, `payload_json`, `server_updated_at`)
SELECT `tenant_id`, `sequence`, `entity_type`, `entity_id`, `row_revision`, `operation`, `payload_json`, `server_updated_at`
FROM `mobile_sync_changes`;
--> statement-breakpoint
INSERT INTO `mobile_sync_change_groups_new` (`tenant_id`, `sequence`, `atomic_group_id`)
SELECT `tenant_id`, `sequence`, `atomic_group_id`
FROM `mobile_sync_change_groups`;
--> statement-breakpoint
DROP TABLE `mobile_sync_change_groups`;
--> statement-breakpoint
DROP TABLE `mobile_sync_changes`;
--> statement-breakpoint
ALTER TABLE `mobile_sync_changes_new` RENAME TO `mobile_sync_changes`;
--> statement-breakpoint
ALTER TABLE `mobile_sync_change_groups_new` RENAME TO `mobile_sync_change_groups`;
--> statement-breakpoint
CREATE INDEX `mobile_sync_changes_tenant_entity_idx`
	ON `mobile_sync_changes` (`tenant_id`, `entity_type`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `mobile_sync_change_groups_atomic_idx`
	ON `mobile_sync_change_groups` (`tenant_id`, `atomic_group_id`, `sequence`);
--> statement-breakpoint
CREATE TRIGGER `accounts_mobile_sync_insert`
AFTER INSERT ON `accounts`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'account', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_account_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `accounts_mobile_sync_update`
AFTER UPDATE ON `accounts`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `accounts`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'account', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_account_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `accounts_mobile_sync_delete`
AFTER DELETE ON `accounts`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'account', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
END;
--> statement-breakpoint
CREATE TRIGGER `categories_mobile_sync_insert`
AFTER INSERT ON `categories`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'category', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_category_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_mobile_sync_update`
AFTER UPDATE ON `categories`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `categories`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'category', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_category_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_mobile_sync_delete`
AFTER DELETE ON `categories`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'category', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_mobile_sync_insert`
AFTER INSERT ON `transactions`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'transaction', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_transaction_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		printf('%s:%d', NEW.`transfer_group_id`, NEW.`revision`)
	WHERE NEW.`transfer_group_id` IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM `transfer_groups`
			WHERE `tenant_id` = NEW.`tenant_id` AND `id` = NEW.`transfer_group_id`
		);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription:' || NEW.`subscription_id`
	WHERE NEW.`subscription_id` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_mobile_sync_update`
AFTER UPDATE ON `transactions`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `transactions`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'transaction', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_transaction_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		printf('%s:%d', NEW.`transfer_group_id`, NEW.`revision` + 1)
	WHERE NEW.`transfer_group_id` IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM `transfer_groups`
			WHERE `tenant_id` = NEW.`tenant_id` AND `id` = NEW.`transfer_group_id`
		);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription:' || NEW.`subscription_id`
	WHERE NEW.`subscription_id` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_mobile_sync_delete`
AFTER DELETE ON `transactions`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'transaction', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		printf('%s:%d', OLD.`transfer_group_id`, OLD.`revision` + 1)
	WHERE OLD.`transfer_group_id` IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM `transfer_groups`
			WHERE `tenant_id` = OLD.`tenant_id` AND `id` = OLD.`transfer_group_id`
		);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'subscription:' || OLD.`subscription_id`
	WHERE OLD.`subscription_id` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_mobile_sync_explicit_revision_update`
AFTER UPDATE ON `transactions`
WHEN NEW.`revision` = OLD.`revision` + 1
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'transaction', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_transaction_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		printf('%s:%d', NEW.`transfer_group_id`, NEW.`revision`)
	WHERE NEW.`transfer_group_id` IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM `transfer_groups`
			WHERE `tenant_id` = NEW.`tenant_id` AND `id` = NEW.`transfer_group_id`
		);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription:' || NEW.`subscription_id`
	WHERE NEW.`subscription_id` IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_mobile_sync_insert`
AFTER INSERT ON `budgets`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'budget', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_budget_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_mobile_sync_update`
AFTER UPDATE ON `budgets`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `budgets`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'budget', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_budget_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `financial_goals_mobile_sync_insert`
AFTER INSERT ON `financial_goals`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'goal', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_goal_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `financial_goals_mobile_sync_update`
AFTER UPDATE ON `financial_goals`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `financial_goals`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'goal', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_goal_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `financial_goals_mobile_sync_delete`
AFTER DELETE ON `financial_goals`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'goal', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
END;
--> statement-breakpoint

CREATE TRIGGER `debts_mobile_sync_insert`
AFTER INSERT ON `debts`
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'debt', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_debt_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `debts_mobile_sync_update`
AFTER UPDATE ON `debts`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `debts`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'debt', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_debt_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `debts_mobile_sync_delete`
AFTER DELETE ON `debts`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'debt', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
END;

CREATE VIEW `mobile_sync_subscription_rows` AS
SELECT
	`tenant_id`,
	`id` AS `entity_id`,
	`revision` AS `row_revision`,
	`updated_at` AS `server_updated_at`,
	json_object(
		'id', `id`,
		'name', `name`,
		'amountMinor', `amount_minor`,
		'currency', `currency`,
		'billingCycle', `billing_cycle`,
		'nextBillingDate', `next_billing_date`,
		'status', `status`,
		'categoryId', `category_id`,
		'accountId', `account_id`,
		'revision', `revision`,
		'updatedAt', `updated_at`
	) AS `payload_json`
FROM `subscriptions`;
--> statement-breakpoint
INSERT INTO `mobile_sync_changes` (
	`tenant_id`, `sequence`, `entity_type`, `entity_id`, `row_revision`,
	`operation`, `payload_json`, `server_updated_at`
)
SELECT
	`tenant_id`,
	(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = subscriptions.`tenant_id`)
		+ row_number() OVER (PARTITION BY `tenant_id` ORDER BY `entity_id`),
	'subscription',
	`entity_id`,
	`row_revision`,
	'upsert',
	`payload_json`,
	`server_updated_at`
FROM `mobile_sync_subscription_rows` subscriptions;
--> statement-breakpoint
UPDATE `mobile_sync_state`
SET `sequence` = (
	SELECT MAX(`sequence`) FROM `mobile_sync_changes`
	WHERE `mobile_sync_changes`.`tenant_id` = `mobile_sync_state`.`tenant_id`
),
`updated_at` = datetime('now')
WHERE EXISTS (
	SELECT 1 FROM `mobile_sync_changes`
	WHERE `mobile_sync_changes`.`tenant_id` = `mobile_sync_state`.`tenant_id`
);
--> statement-breakpoint
CREATE TRIGGER `subscriptions_mobile_sync_insert`
AFTER INSERT ON `subscriptions`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = NEW.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_subscription_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription:' || NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `subscriptions_mobile_sync_update`
AFTER UPDATE ON `subscriptions`
WHEN NEW.`revision` = OLD.`revision`
BEGIN
	UPDATE `subscriptions`
	SET `revision` = OLD.`revision` + 1, `updated_at` = datetime('now')
	WHERE `id` = NEW.`id` AND `tenant_id` = NEW.`tenant_id` AND `revision` = OLD.`revision`;
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (NEW.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes`
	SELECT `tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription', `entity_id`, `row_revision`, 'upsert', `payload_json`, `server_updated_at`
	FROM `mobile_sync_subscription_rows`
	WHERE `tenant_id` = NEW.`tenant_id` AND `entity_id` = NEW.`id`;
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT NEW.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = NEW.`tenant_id`),
		'subscription:' || NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `subscriptions_mobile_sync_delete`
AFTER DELETE ON `subscriptions`
WHEN EXISTS (SELECT 1 FROM `tenants` WHERE `id` = OLD.`tenant_id`)
BEGIN
	INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
	VALUES (OLD.`tenant_id`, 1, datetime('now'))
	ON CONFLICT (`tenant_id`) DO UPDATE
	SET `sequence` = `sequence` + 1, `updated_at` = datetime('now');
	INSERT INTO `mobile_sync_changes` VALUES (
		OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'subscription', OLD.`id`, OLD.`revision` + 1, 'delete', NULL, datetime('now')
	);
	INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
	SELECT OLD.`tenant_id`,
		(SELECT `sequence` FROM `mobile_sync_state` WHERE `tenant_id` = OLD.`tenant_id`),
		'subscription:' || OLD.`id`;
END;
