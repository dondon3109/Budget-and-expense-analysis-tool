CREATE TABLE `assistant_memories` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `kind` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `source` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  `expires_at` text,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_memories_tenant_kind_idx` ON `assistant_memories` (`tenant_id`,`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_memories_tenant_kind_key_unique` ON `assistant_memories` (`tenant_id`,`kind`,`key`);
