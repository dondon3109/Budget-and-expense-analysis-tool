import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadCashflowTrend, loadDashboard } from "../src/db/dashboard";
import {
  workspaceSettingsRepository,
  type WorkspaceSettingsRepository,
} from "../src/db/workspace-settings";
import type { Bindings } from "../src/types";
import { AUTHORIZATION, TENANT_ID, createAppWithFakes, privateHeaders } from "./helpers/app-fakes";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function seededEnv(): { env: Bindings; database: DatabaseSync } {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.exec(`
    INSERT INTO tenants (id, kind, name) VALUES ('tenant-1', 'user', 'Test'), ('tenant-2', 'user', 'Other');
    INSERT INTO fx_usd_rates (date, currency, units_per_usd, source, fetched_at)
      VALUES ('2026-07-01', 'PHP', 50, 'test', '2026-07-01T00:00:00Z'),
             ('2026-07-01', 'EUR', 0.8, 'test', '2026-07-01T00:00:00Z');
    INSERT INTO categories (id, tenant_id, name, kind, color)
      VALUES ('salary', 'tenant-1', 'Salary', 'income', '#123456');
    INSERT INTO accounts (id, tenant_id, name, type, currency)
      VALUES ('cash', 'tenant-1', 'Cash', 'cash', 'PHP'),
             ('wallet', 'tenant-1', 'USD wallet', 'other', 'USD');
    INSERT INTO transactions
      (id, tenant_id, account_id, category_id, date, description, amount_minor, currency, kind)
      VALUES ('peso-pay', 'tenant-1', 'cash', 'salary', '2026-07-20', 'Pay', 500000, 'PHP', 'income'),
             ('dollar-pay', 'tenant-1', 'wallet', 'salary', '2026-07-20', 'Gig', 10000, 'USD', 'income');
  `);
  return { env: { DB: binding }, database };
}

describe("workspaceSettingsRepository", () => {
  it("reads PHP by default and stores a USD choice for that tenant only", async () => {
    const { env } = seededEnv();

    expect(await workspaceSettingsRepository.get(env, "tenant-1")).toEqual({ currency: "PHP" });
    expect(await workspaceSettingsRepository.update(env, "tenant-1", { currency: "USD" })).toEqual({
      currency: "USD",
    });
    expect(await workspaceSettingsRepository.get(env, "tenant-2")).toEqual({ currency: "PHP" });
  });
});

describe("dashboard in the workspace currency", () => {
  const query = { view: "weekly", anchorDate: "2026-07-20" } as const;

  it("converts USD into pesos for a PHP workspace", async () => {
    const { env } = seededEnv();
    const trend = await loadCashflowTrend(env, "tenant-1", query);
    // 5,000.00 PHP + 100.00 USD at 50 = 10,000.00 PHP
    expect(trend.points.at(-1)?.incomeMinor).toBe(1_000_000);
  });

  it("converts pesos into dollars for a USD workspace", async () => {
    const { env } = seededEnv();
    await workspaceSettingsRepository.update(env, "tenant-1", { currency: "USD" });
    const trend = await loadCashflowTrend(env, "tenant-1", query);
    // 100.00 USD + 5,000.00 PHP at 50 = 200.00 USD
    expect(trend.points.at(-1)?.incomeMinor).toBe(20_000);
  });

  it("converts every currency into a EUR workspace through USD", async () => {
    const { env } = seededEnv();
    await workspaceSettingsRepository.update(env, "tenant-1", { currency: "EUR" });
    const trend = await loadCashflowTrend(env, "tenant-1", query);
    // 100.00 USD at 0.8 + 5,000.00 PHP at 0.8 / 50 = 80.00 + 80.00 EUR
    expect(trend.points.at(-1)?.incomeMinor).toBe(16_000);
  });

  it("reports the overall balance in the workspace currency", async () => {
    const { env } = seededEnv();
    await workspaceSettingsRepository.update(env, "tenant-1", { currency: "USD" });
    const summary = await loadDashboard(env, "tenant-1", { from: "2026-07-01", to: "2026-07-31" });
    expect(summary.currency).toBe("USD");
    expect(summary.accountBalances).toMatchObject({
      currency: "USD",
      overallBalanceMinor: 10_000,
      balancesByCurrency: { PHP: 500_000, USD: 10_000 },
    });
  });
});

describe("workspace settings routes", () => {
  function fakeRepository(): WorkspaceSettingsRepository {
    return {
      get: vi.fn().mockResolvedValue({ currency: "PHP" }),
      update: vi.fn().mockResolvedValue({ currency: "USD" }),
    };
  }

  it("reads and updates the resolved tenant's currency", async () => {
    const workspaceSettings = fakeRepository();
    const app = createAppWithFakes({ workspaceSettings });

    const getResponse = await app.request("/api/app/settings", { headers: AUTHORIZATION });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({ currency: "PHP" });
    expect(workspaceSettings.get).toHaveBeenCalledWith(undefined, TENANT_ID);

    const putResponse = await app.request("/api/app/settings", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(putResponse.status).toBe(200);
    expect(workspaceSettings.update).toHaveBeenCalledWith(undefined, TENANT_ID, {
      currency: "USD",
    });
  });

  it("rejects a currency Zoption does not support", async () => {
    const workspaceSettings = fakeRepository();
    const app = createAppWithFakes({ workspaceSettings });

    const response = await app.request("/api/app/settings", {
      method: "PUT",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currency: "XAU" }),
    });
    expect(response.status).toBe(400);
    expect(workspaceSettings.update).not.toHaveBeenCalled();
  });
});
