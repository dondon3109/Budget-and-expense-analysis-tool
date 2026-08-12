CREATE TABLE `customer_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`rating` integer NOT NULL,
	`review` text NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `customer_reviews_rating_check` CHECK (`rating` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_reviews_tenant_unique` ON `customer_reviews` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `customer_reviews_published_updated_idx` ON `customer_reviews` (`published`,`updated_at`);
