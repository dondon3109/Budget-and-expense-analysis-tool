-- The mobile sync payload for a category now carries its product key, so the native apps can tell
-- the archived "Opening balance" category from an ordinary income category and leave it out of
-- income figures like the web does. Product-keyed categories get a revision bump so the explicit
-- revision trigger (0056) re-sends them to devices that already synced the older payload.
DROP VIEW mobile_sync_category_rows;
--> statement-breakpoint
CREATE VIEW mobile_sync_category_rows AS
SELECT
  tenant_id,
  id AS entity_id,
  revision AS row_revision,
  updated_at AS server_updated_at,
  json_object(
    'id', id,
    'name', name,
    'kind', kind,
    'color', color,
    'iconEmoji', icon_emoji,
    'archived', CASE WHEN archived = 1 THEN json('true') ELSE json('false') END,
    'system', CASE WHEN system_key IS NOT NULL THEN json('true') ELSE json('false') END,
    'systemKey', system_key,
    'origin', origin,
    'requiredPlan', required_plan,
    'locked', json('false'),
    'revision', revision,
    'updatedAt', updated_at
  ) AS payload_json
FROM categories;
--> statement-breakpoint
UPDATE categories
SET revision = revision + 1, updated_at = datetime('now')
WHERE system_key IS NOT NULL;
