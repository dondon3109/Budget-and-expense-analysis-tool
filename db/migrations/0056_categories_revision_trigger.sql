-- Migration 0045 bumped category revisions in a backfill, but the only categories
-- trigger fires when a write leaves the revision unchanged, so that backfill emitted
-- no sync change. This trigger mirrors the transactions one and emits a change row
-- whenever a category revision is bumped explicitly.
CREATE TRIGGER `categories_mobile_sync_explicit_revision_update`
AFTER UPDATE ON `categories`
WHEN NEW.`revision` = OLD.`revision` + 1
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
