INSERT OR IGNORE INTO tenants (id, kind, name) VALUES ('demo', 'demo', 'Public demo');

INSERT OR IGNORE INTO accounts (id, tenant_id, name, type) VALUES
  ('account-everyday', 'demo', 'Everyday account', 'checking'),
  ('account-savings', 'demo', 'Savings pocket', 'savings');

INSERT OR IGNORE INTO categories (id, tenant_id, name, kind, color) VALUES
  ('salary', 'demo', 'Salary', 'income', '#3f8f74'),
  ('housing', 'demo', 'Housing', 'expense', '#6f6bd9'),
  ('food', 'demo', 'Food & dining', 'expense', '#dc8b3f'),
  ('transport', 'demo', 'Transport', 'expense', '#3a83c5'),
  ('utilities', 'demo', 'Utilities', 'expense', '#b45a7a'),
  ('leisure', 'demo', 'Leisure', 'expense', '#9a6ac2'),
  ('savings-transfer', 'demo', 'Savings transfer', 'transfer', '#7363a6');

INSERT OR IGNORE INTO transactions
  (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind)
VALUES
  ('t-01', 'demo', 'account-everyday', 'salary', '2026-02-15', 'Monthly salary', 7200000, 'PHP', 'income'),
  ('t-02', 'demo', 'account-everyday', 'housing', '2026-02-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-03', 'demo', 'account-everyday', 'salary', '2026-03-15', 'Monthly salary', 7200000, 'PHP', 'income'),
  ('t-04', 'demo', 'account-everyday', 'housing', '2026-03-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-05', 'demo', 'account-everyday', 'salary', '2026-04-15', 'Monthly salary', 7350000, 'PHP', 'income'),
  ('t-06', 'demo', 'account-everyday', 'housing', '2026-04-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-07', 'demo', 'account-everyday', 'salary', '2026-05-15', 'Monthly salary', 7350000, 'PHP', 'income'),
  ('t-08', 'demo', 'account-everyday', 'housing', '2026-05-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-09', 'demo', 'account-everyday', 'salary', '2026-06-15', 'Monthly salary', 7350000, 'PHP', 'income'),
  ('t-10', 'demo', 'account-everyday', 'housing', '2026-06-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-11', 'demo', 'account-everyday', 'housing', '2026-07-03', 'Apartment rent', -1800000, 'PHP', 'expense'),
  ('t-12', 'demo', 'account-everyday', 'utilities', '2026-07-05', 'Electric and water', -426500, 'PHP', 'expense'),
  ('t-13', 'demo', 'account-everyday', 'food', '2026-07-07', 'Weekly groceries', -348900, 'PHP', 'expense'),
  ('t-14', 'demo', 'account-everyday', 'transport', '2026-07-09', 'Rail and ride share', -214000, 'PHP', 'expense'),
  ('t-15', 'demo', 'account-everyday', 'food', '2026-07-11', 'Dinner with friends', -186500, 'PHP', 'expense'),
  ('t-16', 'demo', 'account-everyday', 'leisure', '2026-07-13', 'Streaming and cinema', -129900, 'PHP', 'expense'),
  ('t-17', 'demo', 'account-everyday', 'salary', '2026-07-15', 'Monthly salary', 7350000, 'PHP', 'income'),
  ('t-18', 'demo', 'account-everyday', 'utilities', '2026-07-16', 'Mobile and internet', -189900, 'PHP', 'expense'),
  ('t-19', 'demo', 'account-savings', 'savings-transfer', '2026-07-17', 'Transfer to savings', 500000, 'PHP', 'transfer');

INSERT OR IGNORE INTO budgets (id, tenant_id, category_id, month, limit_minor) VALUES
  ('b-housing-2026-07', 'demo', 'housing', '2026-07-01', 1800000),
  ('b-food-2026-07', 'demo', 'food', '2026-07-01', 850000),
  ('b-transport-2026-07', 'demo', 'transport', '2026-07-01', 450000),
  ('b-utilities-2026-07', 'demo', 'utilities', '2026-07-01', 700000),
  ('b-leisure-2026-07', 'demo', 'leisure', '2026-07-01', 350000);
