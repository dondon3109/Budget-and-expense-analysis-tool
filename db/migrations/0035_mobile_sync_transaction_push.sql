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
END;
