-- How each transaction was first entered (manual, voice, widget, receipt, sms, pdf, assistant,
-- import), so feature use can be counted per workspace inside D1 rather than in analytics.
-- Written once at create and never returned to clients or included in mobile sync payloads.
-- Existing rows stay NULL: their entry path was never recorded.
ALTER TABLE `transactions` ADD COLUMN `entry_method` text;
