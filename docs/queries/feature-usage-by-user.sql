-- Feature use per user (D1 / SQLite). Read-only. See "Feature use per user" in docs/analytics.md.
--
-- One row per workspace with at least one transaction whose entry method was recorded (migration
-- 0074_transaction_entry_method.sql), busiest first. Each method column counts the transactions
-- first entered that way: typed in a form (manual), a voice draft in the editor (voice), the
-- home-screen widget mic (widget), a receipt photo (receipt), an SMS paste (sms), a PDF statement
-- (pdf), an assistant-drafted save (assistant), or a CSV or Excel file (import).
--
-- Counts are logical transactions: a transfer's two legs count once. Rows deleted since are not
-- counted. Rows from before migration 0074 and system entries (balance adjustments, subscription
-- charges, interest credits) have no entry method and are left out.
--
-- email is the verified sign-in email, which the Worker records when someone opens the web app;
-- it is NULL for a person who only uses the mobile app, so user_id (the Supabase user id) is
-- there to look them up in the Supabase dashboard.
SELECT
  identity.verified_email AS email,
  link.user_id,
  t.tenant_id,
  COUNT(DISTINCT COALESCE(t.transfer_group_id, t.id)) AS total,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'manual' THEN COALESCE(t.transfer_group_id, t.id) END) AS manual,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'voice' THEN COALESCE(t.transfer_group_id, t.id) END) AS voice,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'widget' THEN COALESCE(t.transfer_group_id, t.id) END) AS widget,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'receipt' THEN COALESCE(t.transfer_group_id, t.id) END) AS receipt,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'sms' THEN COALESCE(t.transfer_group_id, t.id) END) AS sms,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'pdf' THEN COALESCE(t.transfer_group_id, t.id) END) AS pdf,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'assistant' THEN COALESCE(t.transfer_group_id, t.id) END) AS assistant,
  COUNT(DISTINCT CASE WHEN t.entry_method = 'import' THEN COALESCE(t.transfer_group_id, t.id) END) AS import,
  MAX(t.created_at) AS last_entered_at
FROM transactions AS t
LEFT JOIN user_tenants AS link ON link.tenant_id = t.tenant_id
LEFT JOIN app_user_identities AS identity ON identity.user_id = link.user_id
WHERE t.entry_method IS NOT NULL AND t.deleted_at IS NULL
GROUP BY t.tenant_id, link.user_id, identity.verified_email
ORDER BY total DESC, t.tenant_id;
