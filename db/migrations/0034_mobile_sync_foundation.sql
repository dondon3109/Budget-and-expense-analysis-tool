ALTER TABLE `accounts` ADD `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` > 0);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `categories` ADD `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` > 0);
--> statement-breakpoint
ALTER TABLE `categories` ADD `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `revision` integer NOT NULL DEFAULT 1 CHECK (`revision` > 0);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `deleted_at` text;
--> statement-breakpoint
CREATE TABLE `mobile_sync_state` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL CHECK (`sequence` >= 0),
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mobile_sync_changes` (
	`tenant_id` text NOT NULL,
	`sequence` integer NOT NULL CHECK (`sequence` > 0),
	`entity_type` text NOT NULL CHECK (`entity_type` IN ('account', 'category', 'transaction')),
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
CREATE INDEX `mobile_sync_changes_tenant_entity_idx`
	ON `mobile_sync_changes` (`tenant_id`, `entity_type`, `entity_id`);
--> statement-breakpoint
CREATE TABLE `mobile_sync_idempotency` (
	`tenant_id` text NOT NULL,
	`client_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`tenant_id`, `client_id`, `idempotency_key`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mobile_sync_idempotency_created_idx` ON `mobile_sync_idempotency` (`created_at`);
--> statement-breakpoint
CREATE VIEW `mobile_sync_account_rows` AS
SELECT
	`tenant_id`,
	`id` AS `entity_id`,
	`revision` AS `row_revision`,
	`updated_at` AS `server_updated_at`,
	json_object(
		'id', `id`,
		'name', `name`,
		'type', `type`,
		'currency', `currency`,
		'archived', CASE WHEN `archived` = 1 THEN json('true') ELSE json('false') END,
		'system', CASE WHEN `system_key` IS NOT NULL THEN json('true') ELSE json('false') END,
		'interest', json_object(
			'enabled', CASE WHEN `interest_enabled` = 1 THEN json('true') ELSE json('false') END,
			'annualRateBasisPoints', `annual_rate_basis_points`,
			'frequency', `interest_frequency`,
			'payDay', `interest_pay_day`
		),
		'revision', `revision`,
		'updatedAt', `updated_at`
	) AS `payload_json`
FROM `accounts`;
--> statement-breakpoint
CREATE VIEW `mobile_sync_category_rows` AS
SELECT
	`tenant_id`,
	`id` AS `entity_id`,
	`revision` AS `row_revision`,
	`updated_at` AS `server_updated_at`,
	json_object(
		'id', `id`,
		'name', `name`,
		'kind', `kind`,
		'color', `color`,
		'archived', CASE WHEN `archived` = 1 THEN json('true') ELSE json('false') END,
		'system', CASE WHEN `system_key` IS NOT NULL THEN json('true') ELSE json('false') END,
		'origin', `origin`,
		'requiredPlan', `required_plan`,
		'locked', json('false'),
		'revision', `revision`,
		'updatedAt', `updated_at`
	) AS `payload_json`
FROM `categories`;
--> statement-breakpoint
CREATE VIEW `mobile_sync_transaction_rows` AS
SELECT
	`tenant_id`,
	`id` AS `entity_id`,
	`revision` AS `row_revision`,
	`updated_at` AS `server_updated_at`,
	json_object(
		'id', `id`,
		'accountId', `account_id`,
		'categoryId', `category_id`,
		'date', `date`,
		'description', `description`,
		'amountMinor', `amount_minor`,
		'currency', `currency`,
		'kind', `kind`,
		'notes', `notes`,
		'transferGroupId', `transfer_group_id`,
		'transferFeeMinor', `transfer_fee_minor`,
		'importFingerprint', `import_fingerprint`,
		'revision', `revision`,
		'updatedAt', `updated_at`
	) AS `payload_json`
FROM `transactions`;
--> statement-breakpoint
INSERT INTO `mobile_sync_changes` (
	`tenant_id`, `sequence`, `entity_type`, `entity_id`, `row_revision`,
	`operation`, `payload_json`, `server_updated_at`
)
SELECT
	`tenant_id`,
	row_number() OVER (
		PARTITION BY `tenant_id`
		ORDER BY `entity_order`, `atomic_order`, `entity_id`
	),
	`entity_type`,
	`entity_id`,
	`row_revision`,
	'upsert',
	`payload_json`,
	`server_updated_at`
FROM (
	SELECT 1 AS `entity_order`, `entity_id` AS `atomic_order`, 'account' AS `entity_type`, * FROM `mobile_sync_account_rows`
	UNION ALL
	SELECT 2 AS `entity_order`, `entity_id` AS `atomic_order`, 'category' AS `entity_type`, * FROM `mobile_sync_category_rows`
	UNION ALL
	SELECT 3 AS `entity_order`, COALESCE(json_extract(`payload_json`, '$.transferGroupId'), `entity_id`) AS `atomic_order`, 'transaction' AS `entity_type`, * FROM `mobile_sync_transaction_rows`
);
--> statement-breakpoint
INSERT INTO `mobile_sync_state` (`tenant_id`, `sequence`, `updated_at`)
SELECT `tenants`.`id`, COALESCE(MAX(`mobile_sync_changes`.`sequence`), 0), datetime('now')
FROM `tenants`
LEFT JOIN `mobile_sync_changes` ON `mobile_sync_changes`.`tenant_id` = `tenants`.`id`
GROUP BY `tenants`.`id`;
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
END;
