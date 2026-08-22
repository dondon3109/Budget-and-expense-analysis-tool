import type { DatabaseSync } from "node:sqlite";

import type { Bindings } from "../../src/types";
import { createD1TestDatabase } from "./d1-test-harness";

function seedSyncFixtures(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES
      ('tenant-1', 'user', 'One'), ('tenant-2', 'user', 'Two');
    INSERT INTO accounts (id, tenant_id, name, type) VALUES
      ('account-1', 'tenant-1', 'Wallet', 'cash'),
      ('account-2', 'tenant-2', 'Private', 'cash');
    INSERT INTO categories (id, tenant_id, name, kind, color, required_plan) VALUES
      ('category-1', 'tenant-1', 'Dining', 'expense', '#123456', 'zoption_pro'),
      ('category-2', 'tenant-2', 'Private', 'expense', '#654321', 'free');
    INSERT INTO transactions (
      id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind
    ) VALUES
      ('transaction-1', 'tenant-1', 'account-1', 'category-1', '2026-08-13', 'Lunch', -25000, 'PHP', 'expense'),
      ('transaction-2', 'tenant-2', 'account-2', 'category-2', '2026-08-13', 'Private', -99900, 'PHP', 'expense');
    INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor) VALUES
      ('budget-1', 'tenant-1', 'category-1', '2026-08-01', 50000);
    INSERT INTO financial_goals (
      id, tenant_id, name, target_amount_minor, current_amount_minor, target_date, status
    ) VALUES
      ('goal-1', 'tenant-1', 'Emergency Fund', 100000, 25000, '2026-12-31', 'active');
    INSERT INTO debts (
      id, tenant_id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of, status
    ) VALUES
      ('debt-1', 'tenant-1', 'Car Loan', 'auto_loan', 500000, 850, 12000, '2026-08-14', 'active');
    INSERT INTO subscriptions (
      id, tenant_id, account_id, category_id, name, amount_minor, billing_cycle, next_billing_date, status
    ) VALUES
      ('subscription-1', 'tenant-1', 'account-1', 'category-1', 'Netflix', 54900, 'monthly', '2026-09-01', 'canceled');
    INSERT INTO calendar_events (id, tenant_id, title, date, start_time, end_time, notes) VALUES
      ('event-1', 'tenant-1', 'Birthday dinner', '2026-08-20', '18:00', '20:00', 'With family');
  `);
}

export function createMobileSyncTestEnvironment(
  beforeTransferMigration?: (database: DatabaseSync) => void,
): { env: Bindings; database: DatabaseSync } {
  const { binding, database } = createD1TestDatabase({
    beforeMigration(context) {
      if (context.name === "0034_mobile_sync_foundation.sql") {
        seedSyncFixtures(context.database);
      }
      if (context.name === "0036_mobile_sync_atomic_transfers.sql") {
        beforeTransferMigration?.(context.database);
      }
    },
  });
  return { env: { DB: binding }, database };
}

/** Grants test Pro access through the same billing state consumed by the production entitlement view. */
export function grantMobileSyncTestPro(database: DatabaseSync, tenantId: string): void {
  database
    .prepare(
      `INSERT INTO billing_subscriptions (
         provider, provider_subscription_id, tenant_id, provider_plan_id, provider_status,
         status, interval, current_period_ends_at, cancel_at_period_end,
         last_provider_occurred_at, last_provider_event_id
       ) VALUES ('paypal', ?, ?, 'test-pro-plan', 'ACTIVE', 'active', 'monthly',
                 '2099-12-31T23:59:59.000Z', 0, '2026-08-22T00:00:00.000Z', ?)`,
    )
    .run(`test-subscription:${tenantId}`, tenantId, `test-event:${tenantId}`);
}
