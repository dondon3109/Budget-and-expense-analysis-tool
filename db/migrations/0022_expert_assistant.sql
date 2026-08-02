ALTER TABLE `transactions` ADD `source_kind` text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_id` text REFERENCES `imports`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_row_number` integer;
--> statement-breakpoint
UPDATE `transactions` SET `source_kind` = 'import' WHERE `import_fingerprint` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `transactions_tenant_import_idx` ON `transactions` (`tenant_id`,`import_id`);
--> statement-breakpoint
ALTER TABLE `assistant_messages` ADD `response_metadata_json` text;
--> statement-breakpoint
ALTER TABLE `assistant_preferences` ADD `consent_version` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `assistant_preferences` ADD `response_detail` text NOT NULL DEFAULT 'concise';
--> statement-breakpoint
ALTER TABLE `assistant_preferences` ADD `coaching_style` text NOT NULL DEFAULT 'gentle';
--> statement-breakpoint
CREATE TABLE `financial_goals` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `target_amount_minor` integer NOT NULL,
  `current_amount_minor` integer NOT NULL DEFAULT 0,
  `target_date` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `financial_goals_tenant_status_idx` ON `financial_goals` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_goals_tenant_name_unique` ON `financial_goals` (`tenant_id`,`name`);
--> statement-breakpoint
CREATE TABLE `debts` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `balance_minor` integer NOT NULL,
  `apr_basis_points` integer NOT NULL,
  `minimum_payment_minor` integer NOT NULL,
  `balance_as_of` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `debts_tenant_status_idx` ON `debts` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `debts_tenant_name_unique` ON `debts` (`tenant_id`,`name`);
--> statement-breakpoint
CREATE TABLE `assistant_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `thread_id` text NOT NULL,
  `user_message_id` text NOT NULL,
  `assistant_message_id` text,
  `prompt_version` text NOT NULL,
  `compliance_policy_json` text NOT NULL,
  `resolved_period_json` text,
  `required_tool_groups_json` text NOT NULL,
  `provider_call_count` integer NOT NULL DEFAULT 0,
  `validation_status` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`thread_id`) REFERENCES `assistant_threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_message_id`) REFERENCES `assistant_messages`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`assistant_message_id`) REFERENCES `assistant_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assistant_runs_tenant_thread_idx` ON `assistant_runs` (`tenant_id`,`thread_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_runs_user_message_unique` ON `assistant_runs` (`user_message_id`);
--> statement-breakpoint
CREATE TABLE `assistant_tool_calls` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `run_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `tool_name` text NOT NULL,
  `arguments_json` text NOT NULL,
  `result_json` text,
  `error_code` text,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`run_id`) REFERENCES `assistant_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_tool_calls_tenant_run_idx` ON `assistant_tool_calls` (`tenant_id`,`run_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_tool_calls_run_sequence_unique` ON `assistant_tool_calls` (`run_id`,`sequence`);
