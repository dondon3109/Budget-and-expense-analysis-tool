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

    const plan = await budgetRepository.get(env, "tenant-1", {
      scope: "month",
      month: "2026-08-01",
    });

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

  it("counts only spending in the workspace currency against its limits", async () => {
    const { binding, database } = createD1TestDatabase();
    databases.push(database);
    const env = { DB: binding } satisfies Bindings;

    database.exec(`
      INSERT INTO tenants (id, kind, name, currency) VALUES ('tenant-1', 'user', 'Test', 'EUR');
      INSERT INTO categories (id, tenant_id, name, kind, color)
        VALUES ('food', 'tenant-1', 'Food', 'expense', '#123456');
      INSERT INTO budgets (id, tenant_id, category_id, month, limit_minor)
        VALUES ('budget-1', 'tenant-1', 'food', '2026-08-01', 40000);
      INSERT INTO transactions
        (id, tenant_id, category_id, date, description, amount_minor, currency, kind)
        VALUES ('euro-lunch', 'tenant-1', 'food', '2026-08-05', 'Lunch', -1500, 'EUR', 'expense'),
               ('yen-ramen', 'tenant-1', 'food', '2026-08-06', 'Ramen', -120000, 'JPY', 'expense');
    `);

    const plan = await budgetRepository.get(env, "tenant-1", {
      scope: "month",
      month: "2026-08-01",
    });

    expect(plan).toMatchObject({
      currency: "EUR",
      totalLimitMinor: 40_000,
      totalSpentMinor: 1_500,
    });
  });

  describe("scopes", () => {
    function seed() {
      const { binding, database } = createD1TestDatabase();
      databases.push(database);
      database.exec(`
        INSERT INTO tenants (id, kind, name) VALUES ('tenant-1', 'user', 'Test');
        INSERT INTO categories (id, tenant_id, name, kind, color)
          VALUES ('food', 'tenant-1', 'Food', 'expense', '#111111'),
                 ('fun', 'tenant-1', 'Fun', 'expense', '#222222');
        INSERT INTO calendar_events (id, tenant_id, title, date)
          VALUES ('party', 'tenant-1', 'Mia birthday', '2026-08-15');
        INSERT INTO transactions
          (id, tenant_id, category_id, date, description, amount_minor, kind)
          VALUES ('cake', 'tenant-1', 'food', '2026-08-15', 'Cake', -50000, 'expense'),
                 ('lunch', 'tenant-1', 'food', '2026-08-16', 'Lunch', -20000, 'expense');
      `);
      return { env: { DB: binding } satisfies Bindings };
    }

    it("lets a month override the every-month default, even down to zero", async () => {
      const { env } = seed();
      await budgetRepository.upsert(env, "tenant-1", {
        scope: "every-month",
        items: [
          { categoryId: "food", limitMinor: 100_000 },
          { categoryId: "fun", limitMinor: 30_000 },
        ],
      });
      await budgetRepository.upsert(env, "tenant-1", {
        scope: "month",
        month: "2026-08-01",
        items: [{ categoryId: "fun", limitMinor: 0 }],
      });

      const august = await budgetRepository.get(env, "tenant-1", {
        scope: "month",
        month: "2026-08-01",
      });
      const september = await budgetRepository.get(env, "tenant-1", {
        scope: "month",
        month: "2026-09-01",
      });

      expect(august.items.map((item) => [item.categoryId, item.limitMinor, item.source])).toEqual([
        ["food", 100_000, "every-month"],
        ["fun", 0, "month"],
      ]);
      expect(september.totalLimitMinor).toBe(130_000);
    });

    it("counts only the occasion's day against its own budget", async () => {
      const { env } = seed();
      await budgetRepository.upsert(env, "tenant-1", {
        scope: "occasion",
        eventId: "party",
        items: [{ categoryId: "food", limitMinor: 80_000 }],
      });

      const occasion = await budgetRepository.get(env, "tenant-1", {
        scope: "occasion",
        eventId: "party",
      });
      const occasions = await budgetRepository.listOccasions(env, "tenant-1", "2026-08-01");
      const month = await budgetRepository.get(env, "tenant-1", {
        scope: "month",
        month: "2026-08-01",
      });

      expect(occasion).toMatchObject({
        title: "Mia birthday",
        totalLimitMinor: 80_000,
        totalSpentMinor: 50_000,
      });
      expect(occasions).toEqual([
        {
          eventId: "party",
          title: "Mia birthday",
          date: "2026-08-15",
          totalLimitMinor: 80_000,
          totalSpentMinor: 50_000,
        },
      ]);
      expect(month.totalLimitMinor).toBe(0);
    });

    it("rejects an occasion whose event does not exist", async () => {
      const { env } = seed();
      await expect(
        budgetRepository.upsert(env, "tenant-1", {
          scope: "occasion",
          eventId: "missing",
          items: [{ categoryId: "food", limitMinor: 1_000 }],
        }),
      ).rejects.toMatchObject({ code: "event_not_found" });
    });
  });
});
