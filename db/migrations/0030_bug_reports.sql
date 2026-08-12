CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`tenant_id` text NOT NULL,
	`reporter_user_id` text NOT NULL,
	`reporter_email` text,
	`client_request_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`actual_behavior` text NOT NULL,
	`expected_behavior` text NOT NULL,
	`steps_to_reproduce` text NOT NULL,
	`frequency` text NOT NULL,
	`page_context` text NOT NULL,
	`diagnostics_json` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`notification_attempts` integer DEFAULT 0 NOT NULL,
	`notification_lease_until` text,
	`last_notification_error_code` text,
	`notified_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `bug_reports_category_check` CHECK (`category` IN ('ui', 'data', 'import', 'billing', 'authentication', 'performance', 'other')),
	CONSTRAINT `bug_reports_frequency_check` CHECK (`frequency` IN ('once', 'sometimes', 'always', 'unknown')),
	CONSTRAINT `bug_reports_page_context_check` CHECK (`page_context` IN ('dashboard', 'assistant', 'calendar', 'transactions', 'import', 'budgets', 'subscriptions', 'plan', 'settings', 'app')),
	CONSTRAINT `bug_reports_status_check` CHECK (`status` IN ('new', 'triaged', 'needs_info', 'in_progress', 'resolved', 'closed', 'duplicate')),
	CONSTRAINT `bug_reports_notification_status_check` CHECK (`notification_status` IN ('pending', 'sent', 'failed')),
	CONSTRAINT `bug_reports_notification_attempts_nonnegative` CHECK (`notification_attempts` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_reports_reference_unique` ON `bug_reports` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bug_reports_tenant_client_request_unique` ON `bug_reports` (`tenant_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `bug_reports_tenant_created_idx` ON `bug_reports` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_status_updated_idx` ON `bug_reports` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `bug_reports_notification_retry_idx` ON `bug_reports` (`notification_status`,`notification_lease_until`,`notification_attempts`);
