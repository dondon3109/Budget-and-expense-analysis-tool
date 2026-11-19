import type { SQLiteDatabase } from "expo-sqlite";

import { assertDevelopmentAppVariant, isDevelopmentAppVariant } from "@/config/app-variant";

export const DUMMY_DEV_SUBJECT = "00000000-0000-4000-8000-000000000001";

export function isDummyDevelopmentSubject(subject: string | null | undefined): boolean {
  return isDevelopmentAppVariant() && subject === DUMMY_DEV_SUBJECT;
}

/** A local calendar date, `YYYY-MM-DD`. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The given day of the month `offset` months from `now`, clamped to a short month's last day.
 * A past date (a transaction) in the current month never reaches beyond today.
 */
function dayOfMonth(now: Date, offset: number, day: number, past = false): string {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate();
  const ceiling = past && offset === 0 ? Math.min(lastDay, now.getDate()) : lastDay;
  return isoDate(new Date(now.getFullYear(), now.getMonth() + offset, Math.min(day, ceiling)));
}

/** The budget month key, `YYYY-MM-01`, `offset` months from `now`. */
function budgetMonth(now: Date, offset: number): string {
  return isoDate(new Date(now.getFullYear(), now.getMonth() + offset, 1));
}

// Dates are relative to the day the seed runs, so Home, Budgets, and the dummy assistant
// (`src/api/assistant-dummy.ts`, which quotes these figures) always show the current month.
export async function seedDummyWorkspaceData(
  database: SQLiteDatabase,
  now = new Date(),
): Promise<void> {
  assertDevelopmentAppVariant();
  const today = isoDate(now);
  const asOf = `${today}T00:00:00.000Z`;
  const current = (day: number) => dayOfMonth(now, 0, day, true);
  const previous = (day: number) => dayOfMonth(now, -1, day);
  const thisMonth = (day: number) => dayOfMonth(now, 0, day);
  const next = (day: number) => dayOfMonth(now, 1, day);
  const currentMonth = budgetMonth(now, 0);
  const prevMonth = budgetMonth(now, -1);
  await database.withTransactionAsync(async () => {
    // 1. Seed Accounts
    await database.runAsync(`
      INSERT OR REPLACE INTO accounts (
        id, name, type, currency, balance_minor, balance_as_of, archived, system, server_revision, sync_state
      ) VALUES
        ('account-bpi-savings', 'BPI Savings', 'savings', 'PHP', 12545000, '${asOf}', 0, 0, 1, 'synced'),
        ('account-gcash-wallet', 'GCash Wallet', 'cash', 'PHP', 832050, '${asOf}', 0, 0, 1, 'synced'),
        ('account-bdo-checking', 'BDO Checking', 'checking', 'PHP', 4500000, '${asOf}', 0, 0, 1, 'synced'),
        ('account-citi-card', 'Citibank Card', 'credit', 'PHP', -1250000, '${asOf}', 0, 0, 1, 'synced');
    `);

    // 2. Seed Categories
    await database.runAsync(`
      INSERT OR REPLACE INTO categories (
        id, name, kind, color, icon_emoji, archived, system, origin, required_plan, locked, server_revision, sync_state
      ) VALUES
        ('category-salary', 'Salary', 'income', '#0F6B5B', '💼', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-groceries', 'Groceries', 'expense', '#3B82F6', '🛒', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-dining', 'Dining & Food', 'expense', '#F59E0B', '🍔', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-utilities', 'Utilities & Bills', 'expense', '#8B5CF6', '💡', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-shopping', 'Shopping', 'expense', '#EC4899', '🎁', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-transport', 'Transportation', 'expense', '#10B981', '🚗', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-healthcare', 'Healthcare', 'expense', '#EF4444', '💊', 0, 0, 'starter', 'free', 0, 1, 'synced'),
        ('category-transfer', 'Transfer', 'transfer', '#008877', NULL, 0, 1, 'system', 'free', 0, 1, 'synced');
    `);

    // 3. Seed Budgets for the current and previous months
    await database.runAsync(`
      INSERT OR REPLACE INTO budgets (
        id, category_id, month, limit_minor, server_revision, sync_state
      ) VALUES
        ('budget-${currentMonth}-groceries', 'category-groceries', '${currentMonth}', 1500000, 1, 'synced'),
        ('budget-${currentMonth}-dining', 'category-dining', '${currentMonth}', 800000, 1, 'synced'),
        ('budget-${currentMonth}-utilities', 'category-utilities', '${currentMonth}', 700000, 1, 'synced'),
        ('budget-${currentMonth}-shopping', 'category-shopping', '${currentMonth}', 500000, 1, 'synced'),
        ('budget-${currentMonth}-transport', 'category-transport', '${currentMonth}', 400000, 1, 'synced'),
        ('budget-${prevMonth}-groceries', 'category-groceries', '${prevMonth}', 1500000, 1, 'synced'),
        ('budget-${prevMonth}-dining', 'category-dining', '${prevMonth}', 800000, 1, 'synced');
    `);

    // 4. Seed Transactions
    await database.runAsync(`
      INSERT OR REPLACE INTO transactions (
        id, account_id, category_id, date, description, amount_minor, currency, kind, notes, server_revision, sync_state
      ) VALUES
        ('tx-01', 'account-bpi-savings', 'category-salary', '${current(15)}', 'Bi-Monthly Salary Deposit', 6500000, 'PHP', 'income', 'Direct deposit from employer', 1, 'synced'),
        ('tx-02', 'account-bdo-checking', 'category-groceries', '${current(23)}', 'SM Supermarket Groceries', -345025, 'PHP', 'expense', 'Weekly pantry restock', 1, 'synced'),
        ('tx-03', 'account-gcash-wallet', 'category-dining', '${current(22)}', 'GrabFood Dinner Delivery', -68000, 'PHP', 'expense', 'Ramen and gyoza', 1, 'synced'),
        ('tx-04', 'account-bdo-checking', 'category-utilities', '${current(20)}', 'Meralco Electric Bill', -423050, 'PHP', 'expense', 'Monthly billing statement', 1, 'synced'),
        ('tx-05', 'account-bpi-savings', 'category-transport', '${current(19)}', 'Shell V-Power Gasoline', -210000, 'PHP', 'expense', 'Full tank fuel', 1, 'synced'),
        ('tx-06', 'account-citi-card', 'category-shopping', '${current(18)}', 'Uniqlo Department Store', -289000, 'PHP', 'expense', 'Work clothes', 1, 'synced'),
        ('tx-07', 'account-gcash-wallet', 'category-dining', '${current(17)}', 'Starbucks Reserve Coffee', -24500, 'PHP', 'expense', 'Iced shaken espresso', 1, 'synced'),
        ('tx-08', 'account-gcash-wallet', 'category-healthcare', '${current(14)}', 'Mercury Drug Pharmacy', -85000, 'PHP', 'expense', 'Vitamins and supplements', 1, 'synced'),
        ('tx-09', 'account-bdo-checking', 'category-groceries', '${current(12)}', 'Puregold Market', -215000, 'PHP', 'expense', 'Fresh fruits and meat', 1, 'synced'),
        ('tx-10', 'account-bdo-checking', 'category-utilities', '${current(10)}', 'PLDT Home Fiber', -189900, 'PHP', 'expense', 'Monthly broadband bill', 1, 'synced'),
        ('tx-11', 'account-gcash-wallet', 'category-dining', '${current(8)}', 'Jollibee Fast Food', -59000, 'PHP', 'expense', 'Chickenjoy bundle', 1, 'synced'),
        ('tx-12', 'account-bdo-checking', 'category-groceries', '${current(5)}', 'Robinsons Supermarket', -412000, 'PHP', 'expense', 'Household supplies', 1, 'synced'),
        ('tx-13', 'account-bpi-savings', 'category-salary', '${previous(31)}', 'End of Month Salary Deposit', 6500000, 'PHP', 'income', 'Last month payroll', 1, 'synced'),
        ('tx-14', 'account-bpi-savings', 'category-groceries', '${previous(28)}', 'S&R Membership Shopping', -635000, 'PHP', 'expense', 'Bulk grocery haul', 1, 'synced'),
        ('tx-15', 'account-citi-card', 'category-utilities', '${previous(25)}', 'Netflix Subscription', -54900, 'PHP', 'expense', 'Monthly premium plan', 1, 'synced');
    `);

    // 5. Seed Financial Goals
    await database.runAsync(`
      INSERT OR REPLACE INTO financial_goals (
        id, name, target_amount_minor, current_amount_minor, target_date, status, server_revision, sync_state
      ) VALUES
        ('goal-emergency-fund', 'Emergency Fund', 15000000, 8500000, '${dayOfMonth(now, 6, 31)}', 'active', 1, 'synced'),
        ('goal-japan-trip', 'Japan Vacation', 10000000, 4200000, '${dayOfMonth(now, 5, 15)}', 'active', 1, 'synced'),
        ('goal-new-laptop', 'MacBook Pro M3', 7500000, 7500000, '${current(1)}', 'completed', 1, 'synced');
    `);

    // 6. Seed Debts
    await database.runAsync(`
      INSERT OR REPLACE INTO debts (
        id, name, type, balance_minor, apr_basis_points, minimum_payment_minor, balance_as_of, status, server_revision, sync_state
      ) VALUES
        ('debt-citi-card', 'Citibank Card Balance', 'credit_card', 1250000, 2400, 150000, '${asOf}', 'active', 1, 'synced');
    `);

    // 7. Seed Subscriptions
    await database.runAsync(`
      INSERT OR REPLACE INTO subscriptions (
        id, name, amount_minor, currency, billing_cycle, next_billing_date, status, category_id, account_id, server_revision, sync_state
      ) VALUES
        ('sub-netflix', 'Netflix 4K', 54900, 'PHP', 'monthly', '${next(1)}', 'active', 'category-utilities', 'account-citi-card', 1, 'synced'),
        ('sub-spotify', 'Spotify Family', 23900, 'PHP', 'monthly', '${next(12)}', 'active', 'category-utilities', 'account-gcash-wallet', 1, 'synced'),
        ('sub-google-one', 'Google One 2TB', 14900, 'PHP', 'monthly', '${next(5)}', 'active', 'category-utilities', 'account-gcash-wallet', 1, 'synced');
    `);

    // 8. Seed Calendar Events
    await database.runAsync(`
      INSERT OR REPLACE INTO calendar_events (
        id, title, date, start_time, end_time, notes, server_revision, sync_state
      ) VALUES
        ('event-meralco-due', 'Meralco Due Date', '${thisMonth(25)}', '09:00', '10:00', 'Pay via BDO Online', 1, 'synced'),
        ('event-payday', 'Salary Payday', '${thisMonth(31)}', '12:00', '13:00', 'Bi-monthly company payroll', 1, 'synced'),
        ('event-citi-due', 'Citibank Payment Due', '${next(5)}', '10:00', '11:00', 'Pay statement balance in full', 1, 'synced');
    `);
  });
}
