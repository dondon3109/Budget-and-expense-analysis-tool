CREATE TABLE `provider_configs` (
  `id` text PRIMARY KEY NOT NULL,
  `service` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `priority` integer NOT NULL,
  `is_active` integer DEFAULT 0 NOT NULL,
  `updated_by` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  CHECK (`enabled` IN (0, 1)),
  CHECK (`is_active` IN (0, 1)),
  CHECK (`priority` >= 1 AND `priority` <= 100),
  CHECK (`service` IN ('assistant', 'stt', 'tts'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_configs_service_active_unique`
ON `provider_configs` (`service`) WHERE `is_active` = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_configs_service_provider_model_unique`
ON `provider_configs` (`service`, `provider`, `model`);
--> statement-breakpoint
CREATE INDEX `provider_configs_service_priority_idx`
ON `provider_configs` (`service`, `priority`);
--> statement-breakpoint
CREATE TABLE `provider_config_audits` (
  `id` text PRIMARY KEY NOT NULL,
  `config_id` text,
  `service` text NOT NULL,
  `action` text NOT NULL,
  `old_value_json` text,
  `new_value_json` text,
  `changed_by` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  CHECK (`action` IN ('create', 'update', 'activate', 'deactivate', 'delete', 'reorder'))
);
--> statement-breakpoint
CREATE INDEX `provider_config_audits_service_created_idx`
ON `provider_config_audits` (`service`, `created_at`);
--> statement-breakpoint
CREATE INDEX `provider_config_audits_config_idx`
ON `provider_config_audits` (`config_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `provider_configs` (`id`, `service`, `provider`, `model`, `enabled`, `priority`, `is_active`, `updated_by`)
VALUES
  ('a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1', 'assistant', 'deepseek', 'deepseek-v4-flash', 1, 1, 1, NULL),
  ('b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2', 'stt', 'cloudflare_workers_ai', '@cf/openai/whisper-large-v3-turbo', 1, 1, 1, NULL),
  ('c3c3c3c3-c3c3-4c3c-c3c3-c3c3c3c3c3c3', 'tts', 'fish_audio', 's2.1-pro-free', 1, 1, 1, NULL);
