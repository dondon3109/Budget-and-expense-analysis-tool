-- First-run onboarding progress: 'currency' (choose the workspace currency), 'cash' (set the
-- starting cash balance), then 'complete'. The currency always has a value (PHP by default), so a
-- timestamp could not tell a user who confirmed step 1 from one who has not started; a step can.
-- Every workspace that exists when this migration runs is an existing user and is backfilled as
-- complete, so nobody is forced through the flow. Their currency is left untouched.
ALTER TABLE `tenants` ADD COLUMN `onboarding_step` text DEFAULT 'currency' NOT NULL CHECK (`onboarding_step` IN ('currency', 'cash', 'complete'));
UPDATE `tenants` SET `onboarding_step` = 'complete';
