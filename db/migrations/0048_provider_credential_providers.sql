-- Widen the credential provider allowlist for multi-provider assistant keys
-- (OpenAI, Anthropic, Gemini, Meta, Muse Spark). SQLite cannot ALTER a CHECK
-- constraint, so the table is rebuilt and existing rows are carried over.
-- Every statement is session-independent (plain tables only): configs that
-- reference a credential are nulled out and restored around the DROP so the
-- rebuild is safe with foreign keys enforced.
CREATE TABLE `provider_credentials_new` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `name` text NOT NULL,
  `encrypted_secret` text NOT NULL,
  `api_key_last4` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_by` text,
  CHECK (`provider` IN ('deepseek', 'openai', 'anthropic', 'gemini', 'meta', 'muse_spark', 'google', 'cloudflare_workers_ai', 'fish_audio')),
  CHECK (length(`name`) >= 2 AND length(`name`) <= 40),
  CHECK (length(`api_key_last4`) = 4)
);
--> statement-breakpoint
INSERT INTO `provider_credentials_new` (`id`, `provider`, `name`, `encrypted_secret`, `api_key_last4`, `created_at`, `updated_at`, `updated_by`)
SELECT `id`, `provider`, `name`, `encrypted_secret`, `api_key_last4`, `created_at`, `updated_at`, `updated_by` FROM `provider_credentials`;
--> statement-breakpoint
CREATE TABLE `_migration_cred_refs` AS
SELECT `id`, `credential_id` FROM `provider_configs` WHERE `credential_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `provider_configs` SET `credential_id` = NULL;
--> statement-breakpoint
DROP TABLE `provider_credentials`;
--> statement-breakpoint
ALTER TABLE `provider_credentials_new` RENAME TO `provider_credentials`;
--> statement-breakpoint
UPDATE `provider_configs` SET `credential_id` =
(SELECT `credential_id` FROM `_migration_cred_refs` WHERE `_migration_cred_refs`.`id` = `provider_configs`.`id`)
WHERE `id` IN (SELECT `id` FROM `_migration_cred_refs`);
--> statement-breakpoint
DROP TABLE `_migration_cred_refs`;
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_provider_name_unique`
ON `provider_credentials` (`provider`, `name`);
--> statement-breakpoint
CREATE INDEX `provider_credentials_provider_idx`
ON `provider_credentials` (`provider`);
--> statement-breakpoint
CREATE INDEX `provider_credentials_updated_at_idx`
ON `provider_credentials` (`updated_at`);
