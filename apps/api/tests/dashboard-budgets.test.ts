import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { loadDashboard } from "../src/db/dashboard";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("loadDashboard budgets", () => {
  it("applies Every month limits unless the month has its own row", async () => {
    const { binding, database } = createD1TestDatabase();
    databases.push(database);
    const env = { DB: binding } satisfies Bindings;

    database.exec(`
      INSERT INTO tenants (id, kind, name) VALUES ('tenant-1', 'user', 'Test');
      INSERT INTO categories (id, tenant_id, name, kind, color)
        VALUES ('food', 'tenant-1', 'Food', 'expense', '#123456'),
               ('fun', 'tenant-1', 'Fun', 'expense', '#654321'),
               ('rent', 'tenant-1', 'Rent', 'expense', '#abcdef');
      INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor)
        VALUES ('every-food', 'tenant-1', 'food', '0001-01-01', 70000),
               ('every-fun', 'tenant-1', 'fun', '0001-01-01', 20000),
               ('nov-fun', 'tenant-1', 'fun', '2026-11-01', 0),
               ('nov-rent', 'tenant-1', 'rent', '2026-11-01', 500000),
               ('oct-rent', 'tenant-1', 'rent', '2026-10-01', 900000);
    `);

    const summary = await loadDashboard(env, "tenant-1", {
      from: "2026-11-01",
      to: "2026-11-30",
    });

    expect(
      summary.budgetProgress.map(({ categoryId, limitMinor }) => ({ categoryId, limitMinor })),
    ).toEqual(
      expect.arrayContaining([
        { categoryId: "food", limitMinor: 70_000 },
        { categoryId: "rent", limitMinor: 500_000 },
      ]),
    );
    expect(summary.budgetProgress).toHaveLength(2);
    expect(summary.metrics.budgetLimitMinor).toBe(570_000);
  });
});
