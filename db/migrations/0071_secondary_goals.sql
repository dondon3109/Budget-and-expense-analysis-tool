-- Goal-based onboarding lets a user pick several goals. `primary_goal` stays the single lead goal
-- (first pick) that drives personalization and the retention segment; the other picks are kept
-- here, in pick order, as a JSON array of goal keys. Existing workspaces get an empty list.
ALTER TABLE `tenants` ADD COLUMN `secondary_goals` text DEFAULT '[]' NOT NULL CHECK (json_valid(`secondary_goals`));
