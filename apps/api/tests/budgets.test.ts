import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { budgetRepository } from "../src/db/budgets";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("budgetRepository", () => {
  it("excludes unbudgeted category spending from remaining budget totals", async () => {
    const { binding, database } = createD1TestDatabase();
    databases.push(database);
    const env = { DB: binding } satisfies Bindings;

    database.exec(`
      INSERT INTO tenants (id, kind, name) VALUES ('tenant-1', 'user', 'Test');
      INSERT INTO categories (id, tenant_id, name, kind, color)
        VALUES ('budgeted', 'tenant-1', 'Budgeted', 'expense', '#123456'),
               ('unbudgeted', 'tenant-1', 'Unbudgeted', 'expense', '#654321');
      INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor)
        VALUES ('budget-1', 'tenant-1', 'budgeted', '2026-08-01', 300000);
      INSERT INTO transactions
        (id, tenant_id, category_id, date, description, amount_minor, kind)
        VALUES ('planned-expense', 'tenant-1', 'budgeted', '2026-08-05', 'Planned', -27500, 'expense'),
               ('other-expense', 'tenant-1', 'unbudgeted', '2026-08-06', 'Other', -246500, 'expense');
    `);

    const plan = await budgetRepository.list(env, "tenant-1", "2026-08-01");

    expect(plan).toMatchObject({
      totalLimitMinor: 300_000,
      totalSpentMinor: 27_500,
      remainingMinor: 272_500,
      usedPercent: 9.2,
    });
    expect(plan.items.find((item) => item.categoryId === "unbudgeted")).toMatchObject({
      limitMinor: 0,
      spentMinor: 246_500,
      remainingMinor: 0,
      usedPercent: 0,
    });
  });
});
