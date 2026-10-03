-- Workspaces, accounts, transactions, and subscriptions can now use any currency in
-- `currencies` (packages/shared/src/types.ts), validated by the shared zod schemas at the API
-- boundary like every other currency column. SQLite cannot drop a CHECK in place, and the
-- workspace currency column carried a PHP/USD one, so the column is moved aside, dropped, and
-- re-added without it. DROP COLUMN rewrites `tenants` in place, so the foreign keys into it stay.
ALTER TABLE `tenants` ADD COLUMN `currency_v70` text DEFAULT 'PHP' NOT NULL;
--> statement-breakpoint
UPDATE `tenants` SET `currency_v70` = `currency`;
--> statement-breakpoint
ALTER TABLE `tenants` DROP COLUMN `currency`;
--> statement-breakpoint
ALTER TABLE `tenants` ADD COLUMN `currency` text DEFAULT 'PHP' NOT NULL;
--> statement-breakpoint
UPDATE `tenants` SET `currency` = `currency_v70`;
--> statement-breakpoint
ALTER TABLE `tenants` DROP COLUMN `currency_v70`;
--> statement-breakpoint
-- One row per currency per day: how many units of `currency` one US dollar buys. Any pair
-- converts through USD. `fx_rates` (USD to PHP only) stays for a Worker that predates this
-- table and is no longer written; its history is copied here so conversions keep their basis.
CREATE TABLE `fx_usd_rates` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`units_per_usd` real NOT NULL CHECK (`units_per_usd` > 0),
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY (`date`, `currency`)
);
--> statement-breakpoint
INSERT INTO `fx_usd_rates` (`date`, `currency`, `units_per_usd`, `source`, `fetched_at`)
SELECT `date`, 'PHP', `usd_to_php`, `source`, `fetched_at` FROM `fx_rates`;
