-- A debt payment is an expense carrying `transactions.debt_id`, a link added in 0062. Until
-- the repository change that ships with this migration, recording or editing one moved the
-- transaction and never the debt, so every payment already on file is still missing from
-- `debts.balance_minor`. Apply each linked payment once, in the direction the runtime code uses:
-- expenses are stored negative, so adding the signed sum subtracts the payment. The result floors
-- at zero and the status follows it, which is what a freshly recorded payment now produces. The
-- debts update trigger emits one sync change per touched row, so installed clients receive the
-- corrected balance without a protocol change.
UPDATE debts
SET balance_minor = MAX(0, debts.balance_minor + paid.total_minor),
	status = CASE
		WHEN MAX(0, debts.balance_minor + paid.total_minor) = 0 THEN 'paid'
		ELSE 'active'
	END,
	updated_at = datetime('now')
FROM (
	SELECT debt_id, tenant_id, SUM(amount_minor) AS total_minor
	FROM transactions
	WHERE debt_id IS NOT NULL AND kind = 'expense'
	GROUP BY debt_id, tenant_id
) AS paid
WHERE paid.debt_id = debts.id AND paid.tenant_id = debts.tenant_id;
