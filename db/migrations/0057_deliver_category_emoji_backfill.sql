-- 0045 filled emoji on starter categories and bumped their revision, but the categories
-- trigger only fires when a write leaves the revision unchanged, so no sync change was
-- emitted and clients never received either the emoji or the new revision. 0056 added the
-- matching explicit-revision trigger; this re-bump emits one change row per starter
-- category so clients converge. A starter category 0045 did not change gets one
-- redundant upsert, which is the safe direction for a one-time migration.
UPDATE categories
SET revision = revision + 1, updated_at = datetime('now')
WHERE origin = 'starter';
