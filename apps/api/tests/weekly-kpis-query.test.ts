import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { PLAN_PRICES_MINOR } from "@zoption/shared";
import { afterEach, describe, expect, it } from "vitest";

import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const report = readFileSync(
  new URL("../../../docs/queries/weekly-kpis.sql", import.meta.url),
  "utf8",
);

interface WeekRow {
  week_of: string;
  site_visitors: null;
  signups: number;
  activated: number;
  paying_customers: number;
  mrr_php: number;
  new_paid: number;
  churned: number;
}

function open() {
  const { database } = createD1TestDatabase();
  databases.push(database);
  return database;
}

// Dates in the seed are relative to this week's Monday, the same anchor the report uses.
const THIS_MONDAY = "date('now', 'weekday 0', '-6 days')";
const at = (days: number) => `datetime(${THIS_MONDAY}, '${days} days', '+12 hours')`;

function subscription(
  id: string,
  tenant: string,
  plan: string,
  interval: string,
  status: string,
  created: number,
  updated: number,
) {
  return `INSERT INTO billing_subscriptions
    (provider, provider_subscription_id, tenant_id, provider_plan_id, provider_status, status,
     interval, plan, last_provider_occurred_at, created_at, updated_at)
    VALUES ('dodo', '${id}', '${tenant}', 'p', '${status}', '${status}', '${interval}', '${plan}',
     ${at(updated)}, ${at(created)}, ${at(updated)});`;
}

describe("weekly growth KPIs report", () => {
  it("counts signups, activation, paying customers, MRR, new paid and churn per week", () => {
    const database = open();
    database.exec(`
      INSERT INTO tenants (id, kind, name) VALUES ('a', 'user', 'A'), ('b', 'user', 'B'), ('c', 'user', 'C'), ('admin', 'user', 'Admin');
      INSERT INTO user_tenants (user_id, tenant_id, created_at) VALUES
        ('u-a', 'a', ${at(0)}), ('u-b', 'b', ${at(1)}), ('u-c', 'c', ${at(-21)}), ('u-admin', 'admin', ${at(0)});
      INSERT INTO platform_admin_grants (user_id) VALUES ('u-admin');
      INSERT INTO categories (id, tenant_id, name, kind, color) VALUES
        ('fa', 'a', 'Food', 'expense', '#000000'), ('fb', 'b', 'Food', 'expense', '#000000');
      INSERT INTO transactions (id, tenant_id, category_id, date, description, amount_minor, kind, entry_method, created_at) VALUES
        ('a1', 'a', 'fa', '2026-10-01', 'x', -100, 'expense', 'manual', ${at(1)}),
        ('a2', 'a', 'fa', '2026-10-01', 'x', -100, 'expense', 'voice', ${at(2)}),
        ('a3', 'a', 'fa', '2026-10-01', 'x', -100, 'expense', 'sms', ${at(3)}),
        ('b1', 'b', 'fb', '2026-10-01', 'x', -100, 'expense', 'manual', ${at(1)}),
        ('b2', 'b', 'fb', '2026-10-01', 'x', -100, 'expense', 'manual', ${at(2)}),
        ('b0', 'b', 'fb', '2026-10-01', 'Opening balance', 5000, 'expense', NULL, ${at(1)});
      ${subscription("s-a", "a", "budget", "month", "active", -3, -3)}
      ${subscription("s-b", "b", "pro", "year", "active", -2, -2)}
      ${subscription("s-c", "c", "family_pro", "month", "canceled", -20, 2)}
      ${subscription("s-trial", "c", "pro", "month", "trialing", -1, -1)}
      ${subscription("s-admin", "admin", "pro", "month", "active", -2, -2)}
    `);

    const rows = database.prepare(report).all() as unknown as WeekRow[];
    const [lastWeek, thisWeek] = rows.slice(-2);

    expect(rows).toHaveLength(12);
    expect(thisWeek).toMatchObject({ site_visitors: null, signups: 2, activated: 1, churned: 1 });
    expect(thisWeek).toMatchObject({ paying_customers: 2, new_paid: 0 });
    expect(thisWeek?.mrr_php).toBe(
      Math.trunc((PLAN_PRICES_MINOR.budget.month * 12 + PLAN_PRICES_MINOR.pro.year) / 1200),
    );
    expect(lastWeek).toMatchObject({ signups: 0, paying_customers: 3, new_paid: 2, churned: 0 });
  });

  it("prices every plan and interval as in PLAN_PRICES_MINOR", () => {
    const database = open();
    database.exec(`INSERT INTO tenants (id, kind, name) VALUES ('t', 'user', 'T');`);
    let expectedAnnualMinor = 0;
    for (const [plan, prices] of Object.entries(PLAN_PRICES_MINOR)) {
      database.exec(subscription(`${plan}-m`, "t", plan, "month", "active", -1, -1));
      database.exec(subscription(`${plan}-y`, "t", plan, "year", "active", -1, -1));
      expectedAnnualMinor += prices.month * 12 + prices.year;
    }

    const rows = database.prepare(report).all() as unknown as WeekRow[];

    expect(rows.at(-1)?.mrr_php).toBe(Math.trunc(expectedAnnualMinor / 1200));
  });
});
