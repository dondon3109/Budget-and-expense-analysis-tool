-- Facts and preferences are permanent from here on, so only expiries that have not
-- already lapsed are cleared: a row whose 90 days passed before this migration ran
-- must not be resurrected.
UPDATE `assistant_memories` SET `expires_at` = NULL
WHERE `kind` IN ('fact', 'preference')
  AND (`expires_at` IS NULL OR `expires_at` > strftime('%Y-%m-%dT%H:%M:%fZ','now'));
