-- Covering index for snapshot latest-revision scans: lets SQLite resolve
-- MAX(sequence) and operation per (tenant_id, entity_type, entity_id) in index order
-- without reading payload_json or bouncing to the main table, and speeds up
-- compaction's newer-revision existence check on the same columns.
CREATE INDEX IF NOT EXISTS `mobile_sync_changes_snapshot_idx`
	ON `mobile_sync_changes` (`tenant_id`, `entity_type`, `entity_id`, `sequence`, `operation`);
--> statement-breakpoint
-- Keyset resume checkpoints for an active snapshot session so consecutive pages
-- (`offset = 0, 200, 400, ...`) seek directly instead of re-scanning earlier pages.
ALTER TABLE `mobile_sync_clients` ADD COLUMN `snapshot_checkpoint_json` text;
