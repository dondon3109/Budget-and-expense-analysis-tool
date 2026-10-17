-- Money sent home to a family. A row starts as sent (no transaction); confirming it arrived
-- creates the family income transaction and stores its id here. There is no foreign key to
-- `transactions`: the amount is always read from the live transaction, so a deleted one simply
-- stops counting, and a restored one counts again.
CREATE TABLE `family_remittances` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`sent_by_user_id` text NOT NULL,
	`sent_amount_minor` integer NOT NULL,
	`sent_currency` text NOT NULL,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`sent_on` text NOT NULL,
	`note` text,
	`transaction_id` text,
	`received_by_user_id` text,
	`received_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "family_remittances_amount_check" CHECK("family_remittances"."sent_amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `family_remittances_tenant_idx` ON `family_remittances` (`tenant_id`, `sent_on`);
--> statement-breakpoint
CREATE UNIQUE INDEX `family_remittances_transaction_unique` ON `family_remittances` (`transaction_id`);
