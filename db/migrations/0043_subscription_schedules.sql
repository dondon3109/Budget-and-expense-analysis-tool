-- Subscription rows describe upcoming recurring costs. Preserve linked charges
-- dated today or earlier in Zoption's Manila calendar as ordinary transaction
-- history, but detach them so later subscription changes cannot rewrite it.
UPDATE `transactions`
SET `subscription_id` = NULL, `updated_at` = datetime('now')
WHERE `subscription_id` IS NOT NULL AND `date` <= date('now', '+8 hours');
--> statement-breakpoint
-- Future linked rows were projections rather than completed bank transactions.
-- Delete triggers publish tombstones so mobile clients remove the projections.
DELETE FROM `transactions` WHERE `subscription_id` IS NOT NULL;
