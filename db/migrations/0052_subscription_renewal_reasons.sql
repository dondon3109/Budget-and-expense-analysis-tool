-- A cycle can be blocked for more than one reason, and the reminder has to say which.
ALTER TABLE `subscription_renewal_notifications` ADD COLUMN `reason` text DEFAULT 'insufficient_balance' NOT NULL;
