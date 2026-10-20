-- Maya joined the starter accounts after most personal workspaces were created, and starter
-- rows are only written when a tenant is created. This gives every existing personal workspace
-- the same `account:maya` row a new one gets, with the same id shape as `starterStatements`.
--
-- A workspace that already tracks its own Maya account (any live account named Maya) is left
-- alone so it does not end up with two. The accounts insert trigger records the mobile sync
-- change, so phones pull the new account on their next sync.
INSERT OR IGNORE INTO `accounts` (`id`, `tenant_id`, `name`, `type`, `currency`, `system_key`)
SELECT `tenants`.`id` || ':account:maya', `tenants`.`id`, 'Maya', 'ewallet', 'PHP', 'account:maya'
FROM `tenants`
WHERE `tenants`.`kind` = 'user'
  AND NOT EXISTS (
    SELECT 1 FROM `accounts`
    WHERE `accounts`.`tenant_id` = `tenants`.`id`
      AND (`accounts`.`system_key` = 'account:maya'
        OR (lower(trim(`accounts`.`name`)) = 'maya' AND `accounts`.`deleted_at` IS NULL))
  );
