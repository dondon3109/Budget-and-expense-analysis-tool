-- A missed-renewal email states the amount in the subscription's currency. The currency is copied
-- onto the notice when it is queued, like the amount and names, so a later edit to the plan cannot
-- pair the queued amount with a different currency. Existing notices take their plan's currency.
ALTER TABLE `subscription_renewal_notifications` ADD COLUMN `currency` text DEFAULT 'PHP' NOT NULL;

UPDATE `subscription_renewal_notifications`
SET `currency` = COALESCE(
  (SELECT `currency` FROM `subscriptions` WHERE `subscriptions`.`id` = `subscription_renewal_notifications`.`subscription_id`),
  'PHP'
);
