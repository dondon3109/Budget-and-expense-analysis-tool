ALTER TABLE categories ADD COLUMN icon_emoji TEXT;
--> statement-breakpoint
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
    'origin', origin,
    'requiredPlan', required_plan,
    'locked', json('false'),
    'revision', revision,
    'updatedAt', updated_at
  ) AS payload_json
FROM categories;
