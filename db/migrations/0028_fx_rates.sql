CREATE TABLE `fx_rates` (
	`date` text PRIMARY KEY NOT NULL,
	`usd_to_php` real NOT NULL,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fx_rates_fetched_at_idx` ON `fx_rates` (`fetched_at`);
