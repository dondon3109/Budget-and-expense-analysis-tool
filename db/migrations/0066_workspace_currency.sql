-- The workspace currency (PHP or USD). It labels amounts that carry no currency of their own
-- (budgets, goals, debts, plans, dashboard totals), is the base the cashflow trend converts
-- into, and is the default for new accounts. Changing it never rewrites a stored amount.
-- Existing workspaces keep PHP, which is what every amount has meant so far.
ALTER TABLE `tenants` ADD COLUMN `currency` text DEFAULT 'PHP' NOT NULL CHECK (`currency` IN ('PHP', 'USD'));
