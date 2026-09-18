-- A due cycle that is not being charged, and why. The subscriptions list reads it so the app can
-- say so instead of leaving the state visible only in an email.
--
-- Deliberately NOT added to mobile_sync_subscription_rows. Every installed app validates the whole
-- pull response with a strict schema and throws invalid_page on an unknown key, so adding a payload
-- field stops sync entirely on any device that has not updated. Surfacing this on mobile needs a
-- client capability first, not a schema change.
ALTER TABLE `subscriptions` ADD COLUMN `renewal_blocked_reason` text;
--> statement-breakpoint
UPDATE `subscriptions` SET `renewal_blocked_reason` = (
	SELECT n.reason FROM `subscription_renewal_notifications` n
	WHERE n.subscription_id = `subscriptions`.`id`
		AND n.due_date = `subscriptions`.`next_billing_date`
	LIMIT 1
)
WHERE EXISTS (
	SELECT 1 FROM `subscription_renewal_notifications` n
	WHERE n.subscription_id = `subscriptions`.`id`
		AND n.due_date = `subscriptions`.`next_billing_date`
);
