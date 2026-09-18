-- One shared monthly AI pool replaces the per-feature AI entitlements. Carry the current
-- Manila month's assistant_question count into ai_usage, retire the stale feature rows, and
-- drop the anchored 14-day cycle table. The billing_monthly_usage triggers are untouched:
-- they stay the atomic cap for ai_usage (500 Free / 2000 Pro per Manila calendar month).
INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance)
SELECT usage.tenant_id,
       usage.month,
       'ai_usage',
       usage.count,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM effective_pro_entitlements
           WHERE effective_pro_entitlements.tenant_id = usage.tenant_id
         ) THEN 2000
         ELSE 500
       END
FROM billing_monthly_usage AS usage
WHERE usage.feature = 'assistant_question'
  -- Asia/Manila is UTC+8 with no DST, so this equals manilaMonth() in the Worker. A migration
  -- cannot bind a JS value; the pool's own consume statement always binds manilaMonth().
  AND usage.month = date('now', '+8 hours', 'start of month');
--> statement-breakpoint
DELETE FROM billing_monthly_usage
WHERE feature IN ('assistant_question', 'vision', 'stt', 'tts', 'pdf');
--> statement-breakpoint
DROP TABLE billing_assistant_cycle_usage;
