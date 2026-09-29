-- A missed-renewal email states the amount in the subscription's currency. The currency is copied
-- onto the notice when it is queued, like the amount and names, so a later edit to the plan cannot
-- pair the queued amount with a different currency. The column is nullable with no default so a
-- Worker that predates it leaves it NULL and the reader falls back to the plan's currency.
ALTER TABLE `subscription_renewal_notifications` ADD COLUMN `currency` text;

UPDATE `subscription_renewal_notifications`
SET `currency` = (
  SELECT `currency` FROM `subscriptions`
  WHERE `subscriptions`.`id` = `subscription_renewal_notifications`.`subscription_id`
    AND `subscriptions`.`tenant_id` = `subscription_renewal_notifications`.`tenant_id`
);
