-- Pet companion: one row per workspace. `state_json` is the replayable PetState from
-- packages/shared/src/pet.ts. Points are derived from activity the workspace already records
-- (transactions, subscriptions, assistant replies) in the window after `processed_through`, plus
-- app check-ins, so no feature route has to report them.
CREATE TABLE `pets` (
  `tenant_id` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL CHECK (`enabled` IN (0, 1)),
  `state_json` text NOT NULL,
  `processed_through` text NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
