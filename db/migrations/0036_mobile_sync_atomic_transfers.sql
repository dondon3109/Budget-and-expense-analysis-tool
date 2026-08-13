CREATE TABLE `transfer_groups` (
	`id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`from_transaction_id` text NOT NULL,
	`to_transaction_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY (`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
	UNIQUE (`tenant_id`, `from_transaction_id`),
	UNIQUE (`tenant_id`, `to_transaction_id`),
	CHECK (`from_transaction_id` != `to_transaction_id`)
);
--> statement-breakpoint
INSERT INTO `transfer_groups` (`id`, `tenant_id`, `from_transaction_id`, `to_transaction_id`)
SELECT
	`transfer_group_id`,
	`tenant_id`,
	MAX(CASE WHEN `amount_minor` < 0 THEN `id` END),
	MAX(CASE WHEN `amount_minor` > 0 THEN `id` END)
FROM `transactions`
WHERE `transfer_group_id` IS NOT NULL AND `kind` = 'transfer'
GROUP BY `tenant_id`, `transfer_group_id`
HAVING COUNT(*) = 2
	AND SUM(CASE WHEN `amount_minor` < 0 THEN 1 ELSE 0 END) = 1
	AND SUM(CASE WHEN `amount_minor` > 0 THEN 1 ELSE 0 END) = 1
	AND COUNT(DISTINCT `account_id`) = 2
	AND COUNT(DISTINCT `category_id`) = 1
	AND COUNT(DISTINCT `date`) = 1
	AND COUNT(DISTINCT `description`) = 1
	AND COUNT(DISTINCT `currency`) = 1
	AND COUNT(DISTINCT COALESCE(`notes`, '')) = 1
	AND COUNT(DISTINCT `revision`) = 1
	AND COALESCE(MAX(CASE WHEN `amount_minor` < 0 THEN `transfer_fee_minor` END), 0) >= 0
	AND COALESCE(MAX(CASE WHEN `amount_minor` > 0 THEN `transfer_fee_minor` END), 0) = 0
	AND SUM(`amount_minor`) + COALESCE(
		MAX(CASE WHEN `amount_minor` < 0 THEN `transfer_fee_minor` END),
		0
	) = 0;
--> statement-breakpoint
CREATE TABLE `mobile_sync_change_groups` (
	`tenant_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`atomic_group_id` text NOT NULL,
	PRIMARY KEY (`tenant_id`, `sequence`),
	FOREIGN KEY (`tenant_id`, `sequence`)
		REFERENCES `mobile_sync_changes` (`tenant_id`, `sequence`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `mobile_sync_change_groups_atomic_idx`
	ON `mobile_sync_change_groups` (`tenant_id`, `atomic_group_id`, `sequence`);
--> statement-breakpoint
INSERT INTO `mobile_sync_change_groups` (`tenant_id`, `sequence`, `atomic_group_id`)
SELECT changes.`tenant_id`, changes.`sequence`, printf(
	'%s:%d',
	json_extract(changes.`payload_json`, '$.transferGroupId'),
	changes.`row_revision`
)
FROM `mobile_sync_changes` changes
JOIN `transfer_groups` groups
	ON groups.`tenant_id` = changes.`tenant_id`
	AND groups.`id` = json_extract(changes.`payload_json`, '$.transferGroupId')
WHERE changes.`entity_type` = 'transaction'
	AND changes.`operation` = 'upsert';
--> statement-breakpoint
CREATE VIEW `mobile_sync_transfer_rows` AS
SELECT
	g.`tenant_id`,
	g.`id` AS `entity_id`,
	from_leg.`revision` AS `row_revision`,
	CASE
		WHEN from_leg.`updated_at` >= to_leg.`updated_at` THEN from_leg.`updated_at`
		ELSE to_leg.`updated_at`
	END AS `server_updated_at`,
	json_object(
		'id', g.`id`,
		'fromTransactionId', from_leg.`id`,
		'toTransactionId', to_leg.`id`,
		'fromAccountId', from_leg.`account_id`,
		'toAccountId', to_leg.`account_id`,
		'categoryId', from_leg.`category_id`,
		'date', from_leg.`date`,
		'description', from_leg.`description`,
		'amountMinor', -from_leg.`amount_minor`,
		'currency', from_leg.`currency`,
		'notes', from_leg.`notes`,
		'transferFeeMinor', COALESCE(from_leg.`transfer_fee_minor`, 0),
		'revision', from_leg.`revision`,
		'updatedAt', CASE
			WHEN from_leg.`updated_at` >= to_leg.`updated_at` THEN from_leg.`updated_at`
			ELSE to_leg.`updated_at`
		END
	) AS `payload_json`
FROM `transfer_groups` g
JOIN `transactions` from_leg
	ON from_leg.`tenant_id` = g.`tenant_id` AND from_leg.`id` = g.`from_transaction_id`
JOIN `transactions` to_leg
	ON to_leg.`tenant_id` = g.`tenant_id` AND to_leg.`id` = g.`to_transaction_id`
WHERE from_leg.`kind` = 'transfer' AND to_leg.`kind` = 'transfer'
	AND from_leg.`transfer_group_id` = g.`id` AND to_leg.`transfer_group_id` = g.`id`
	AND from_leg.`amount_minor` < 0 AND to_leg.`amount_minor` > 0
	AND to_leg.`amount_minor` = -from_leg.`amount_minor` - COALESCE(from_leg.`transfer_fee_minor`, 0)
	AND from_leg.`account_id` != to_leg.`account_id`
	AND from_leg.`category_id` = to_leg.`category_id`
	AND from_leg.`date` = to_leg.`date`
	AND from_leg.`description` = to_leg.`description`
	AND from_leg.`currency` = to_leg.`currency`
	AND COALESCE(from_leg.`notes`, '') = COALESCE(to_leg.`notes`, '')
	AND from_leg.`revision` = to_leg.`revision`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_insert`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_update`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_delete`;
--> statement-breakpoint
DROP TRIGGER `transactions_mobile_sync_explicit_revision_update`;
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
END;
