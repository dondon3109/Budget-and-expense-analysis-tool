UPDATE categories
SET
  icon_emoji = CASE
    WHEN id LIKE '%:category:salary' OR lower(name) = 'salary' THEN '💼'
    WHEN id LIKE '%:category:housing' OR lower(name) = 'housing' OR lower(name) = 'rent' THEN '🏠'
    WHEN id LIKE '%:category:food' OR lower(name) LIKE '%food%' OR lower(name) LIKE '%dining%' THEN '🍔'
    WHEN id LIKE '%:category:transport' OR lower(name) LIKE '%transport%' THEN '🚗'
    WHEN id LIKE '%:category:utilities' OR lower(name) LIKE '%utilit%' OR lower(name) LIKE '%bills%' THEN '💡'
    WHEN id LIKE '%:category:leisure' OR lower(name) = 'leisure' OR lower(name) = 'shopping' THEN '🎁'
    WHEN id LIKE '%:category:savings-transfer' OR lower(name) LIKE '%savings%' THEN '💰'
    WHEN lower(name) LIKE '%grocer%' THEN '🛒'
    WHEN lower(name) LIKE '%health%' OR lower(name) LIKE '%medic%' THEN '💊'
    ELSE icon_emoji
  END,
  revision = revision + 1,
  updated_at = datetime('now')
WHERE (icon_emoji IS NULL OR icon_emoji = '') AND origin = 'starter';
