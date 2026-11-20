-- Money preferences asked during onboarding and editable in Account Settings: how the user is
-- paid, how they like to budget, and up to three spending areas to watch (a JSON array of keys,
-- in pick order). They tailor in-app suggestions and the assistant. NULL or an empty list means
-- not answered, which is every existing workspace.
ALTER TABLE `tenants` ADD COLUMN `income_cadence` text CHECK (`income_cadence` IN ('monthly', 'semi_monthly', 'weekly', 'irregular'));
ALTER TABLE `tenants` ADD COLUMN `budgeting_style` text CHECK (`budgeting_style` IN ('category_limits', 'fifty_thirty_twenty', 'zero_based', 'not_sure'));
ALTER TABLE `tenants` ADD COLUMN `spending_focus` text DEFAULT '[]' NOT NULL CHECK (json_valid(`spending_focus`));
