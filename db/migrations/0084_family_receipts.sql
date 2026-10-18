-- One receipt photo per family transaction; the image lives in the private RECEIPTS bucket under
-- `object_key`. `transaction_id` has no foreign key: the photo outlives a delete so a restore
-- brings it back, and the daily cron removes it once the restore window has passed.
CREATE TABLE `family_receipts` (
	`tenant_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`tenant_id`, `transaction_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
