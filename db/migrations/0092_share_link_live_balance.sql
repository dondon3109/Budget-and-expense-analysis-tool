-- Live balance links. A balance link with `live_balance = 1` shows the account's current balance
-- next to the frozen one it was shared with, so the public read looks the account up by
-- `source_id` within the row's own `tenant_id`. Links made before this column existed were
-- promised a frozen snapshot, so they default to 0 and stay frozen.
ALTER TABLE `share_links` ADD COLUMN `live_balance` integer DEFAULT 0 NOT NULL CHECK (`live_balance` IN (0, 1));
