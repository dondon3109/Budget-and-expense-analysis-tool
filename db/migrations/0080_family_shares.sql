-- Who added a family entry. Null on personal rows and on family rows written before this column,
-- which only the family owner can edit.
ALTER TABLE `transactions` ADD `created_by_user_id` text;
--> statement-breakpoint
-- A personal transaction copied into a family. The family never reads this table's source
-- columns; it exists so a transaction is copied at most once per family and so the person sees
-- where it went. Deleting either transaction drops the link, and the copy stays.
CREATE TABLE `family_transaction_shares` (
	`source_transaction_id` text NOT NULL,
	`source_tenant_id` text NOT NULL,
	`family_tenant_id` text NOT NULL,
	`family_transaction_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`source_transaction_id`, `family_tenant_id`),
	FOREIGN KEY (`source_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_transaction_shares_copy_unique` ON `family_transaction_shares` (`family_transaction_id`);
--> statement-breakpoint
CREATE INDEX `family_transaction_shares_source_tenant_idx` ON `family_transaction_shares` (`source_tenant_id`);
--> statement-breakpoint
-- One personal account's balance shown in a family. While `frozen_at` is null the family reads
-- the balance live from the source account; once frozen it shows the stored values. The source
-- columns carry no foreign key so a frozen row outlives the account and the person's data.
CREATE TABLE `family_balance_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`family_tenant_id` text NOT NULL,
	`source_tenant_id` text NOT NULL,
	`source_account_id` text NOT NULL,
	`shared_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`frozen_at` text,
	`frozen_name` text,
	`frozen_currency` text,
	`frozen_balance_minor` integer,
	FOREIGN KEY (`family_tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_balance_shares_account_unique` ON `family_balance_shares` (`family_tenant_id`, `source_tenant_id`, `source_account_id`);
--> statement-breakpoint
CREATE INDEX `family_balance_shares_source_idx` ON `family_balance_shares` (`source_tenant_id`);
