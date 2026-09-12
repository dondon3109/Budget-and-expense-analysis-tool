import type { TransactionListItem } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { Hono } from "hono";
import { createExportRoutes } from "../src/routes/exports";
import type { BillingRepository } from "../src/db/billing";
import type { TransactionRepository } from "../src/db/transactions";
import type { AppEnvironment } from "../src/types";

const mockTransaction: TransactionListItem = {
  id: "transaction-1",
  date: "2026-07-20",
  description: "Market purchase",
  amountMinor: -125_000,
  currency: "PHP",
  kind: "expense",
  categoryId: "food",
  categoryName: "Food",
  categoryColor: "#dc8b3f",
  accountId: "account-1",
  accountName: "Everyday",
  notes: null,
};

describe("full account archive export (Data Portability)", () => {
  it("exports account-archive.json without requiring pro entitlement", async () => {
    const requirePro = vi.fn(async () => {
      throw new Error("requirePro should not be called for full account archive export!");
    });
    const billing: Pick<BillingRepository, "requirePro"> = { requirePro };

    const transactionRepo: TransactionRepository = {
      list: vi.fn(),
      calendar: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      export: vi.fn(async () => [mockTransaction]),
    };

    const routes = createExportRoutes(transactionRepo, billing);

    // Mock D1 database prepare/batch/select
    const stmt = {
      bind: vi.fn(() => stmt),
      all: vi.fn(async () => ({ results: [] })),
      raw: vi.fn(async () => []),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({})),
    };

    const mockDb = {
      prepare: vi.fn(() => stmt),
      batch: vi.fn(async () => []),
    };

    const env = {
      DB: mockDb,
    };

    const app = new Hono<AppEnvironment>();
    const authUser = { id: "user-123", email: "user@example.com" };
    const tenant = { tenantId: "user:user-123" };

    app.use("*", async (c, next) => {
      c.set("tenant", tenant as any);
      c.set("authUser", authUser as any);
      await next();
    });
    app.route("/", routes);

    const response = await app.fetch(new Request("http://localhost/account-archive.json"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain("zoption-account-archive-");
    expect(requirePro).not.toHaveBeenCalled();

    const data = (await response.json()) as Record<string, unknown>;
    expect(data).toMatchObject({
      version: "1.0",
      user: {
        id: "user-123",
        email: "user@example.com",
      },
      transactions: [mockTransaction],
    });
    expect(Array.isArray(data.accounts)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
    expect(Array.isArray(data.budgets)).toBe(true);
    expect(Array.isArray(data.subscriptions)).toBe(true);
    expect(Array.isArray(data.goals)).toBe(true);
    expect(Array.isArray(data.debts)).toBe(true);
    expect(Array.isArray(data.calendarEvents)).toBe(true);
  });
});
