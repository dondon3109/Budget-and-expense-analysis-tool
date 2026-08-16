CREATE TABLE `receipt_preferences` (
  `tenant_id` text PRIMARY KEY NOT NULL,
  `consented_at` text,
  `consent_version` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
