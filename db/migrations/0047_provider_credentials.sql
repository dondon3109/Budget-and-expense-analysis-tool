CREATE TABLE `provider_credentials` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `name` text NOT NULL,
  `encrypted_secret` text NOT NULL,
  `api_key_last4` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_by` text,
  CHECK (`provider` IN ('deepseek', 'google', 'cloudflare_workers_ai', 'fish_audio')),
  CHECK (length(`name`) >= 2 AND length(`name`) <= 40),
  CHECK (length(`api_key_last4`) = 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_provider_name_unique`
ON `provider_credentials` (`provider`, `name`);
--> statement-breakpoint
CREATE INDEX `provider_credentials_provider_idx`
ON `provider_credentials` (`provider`);
--> statement-breakpoint
CREATE INDEX `provider_credentials_updated_at_idx`
ON `provider_credentials` (`updated_at`);
--> statement-breakpoint
ALTER TABLE `provider_configs` ADD COLUMN `display_name` text;
--> statement-breakpoint
ALTER TABLE `provider_configs` ADD COLUMN `credential_id` text REFERENCES `provider_credentials`(`id`);
--> statement-breakpoint
UPDATE `provider_configs` SET `display_name` = `provider` || ' / ' || `model` WHERE `display_name` IS NULL;
--> statement-breakpoint
CREATE INDEX `provider_configs_credential_idx`
ON `provider_configs` (`credential_id`);
