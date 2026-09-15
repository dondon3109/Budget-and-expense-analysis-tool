ALTER TABLE `assistant_memories` ADD COLUMN `thread_id` text;
--> statement-breakpoint
CREATE INDEX `assistant_memories_tenant_updated_idx` ON `assistant_memories` (`tenant_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `assistant_memories_thread_idx` ON `assistant_memories` (`thread_id`);
