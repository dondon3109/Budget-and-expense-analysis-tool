ALTER TABLE `customer_reviews` ADD `moderation_status` text DEFAULT 'pending' NOT NULL CONSTRAINT `customer_reviews_moderation_status_check` CHECK (`moderation_status` IN ('pending', 'published', 'hidden'));--> statement-breakpoint
ALTER TABLE `customer_reviews` ADD `featured_order` integer CONSTRAINT `customer_reviews_featured_order_check` CHECK (`featured_order` IS NULL OR `featured_order` BETWEEN 1 AND 6);--> statement-breakpoint
UPDATE `customer_reviews` SET `moderation_status` = 'published' WHERE `published` = 1;--> statement-breakpoint
WITH `ranked_reviews` AS (
	SELECT `id`, ROW_NUMBER() OVER (ORDER BY `updated_at` DESC, `id`) AS `position`
	FROM `customer_reviews`
	WHERE `published` = 1
)
UPDATE `customer_reviews`
SET `featured_order` = (
	SELECT `position` FROM `ranked_reviews` WHERE `ranked_reviews`.`id` = `customer_reviews`.`id`
)
WHERE `id` IN (SELECT `id` FROM `ranked_reviews` WHERE `position` <= 6);--> statement-breakpoint
CREATE INDEX `customer_reviews_moderation_updated_idx` ON `customer_reviews` (`moderation_status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_reviews_featured_order_unique` ON `customer_reviews` (`featured_order`) WHERE `featured_order` IS NOT NULL;
