-- What each linked debt payment really took off its debt. A debt's balance stops at zero, so a
-- payment larger than the balance takes off less than its amount, and reversing it (an edit or a
-- delete) must give back only that. `payment_key` is the expense's transaction id, or the
-- transfer group's id for a transfer. A payment recorded before this table has no row and
-- reverses by its full amount, as it always did.
CREATE TABLE `debt_payment_applied` (
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  `payment_key` text NOT NULL,
  `debt_id` text NOT NULL,
  `applied_minor` integer NOT NULL,
  PRIMARY KEY (`tenant_id`, `payment_key`),
  CONSTRAINT `debt_payment_applied_nonnegative` CHECK (`applied_minor` >= 0)
);
