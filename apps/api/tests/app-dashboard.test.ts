import { describe, expect, it, vi } from "vitest";

import type { BillingRepository } from "../src/db/billing";
import {
  AUTHORIZATION,
  TENANT_ID,
  cashflowTrendFixture,
  dashboardFixture,
  createAllowedBillingRepository,
  createAppWithFakes,
} from "./helpers/app-fakes";

describe("API foundation", () => {
  it("validates dashboard date ranges", async () => {
    const app = createAppWithFakes({
      dashboardLoader: vi.fn().mockResolvedValue(dashboardFixture),
    });
    const response = await app.request("/api/app/dashboard?from=2026-08-01&to=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(400);
  });

  it("loads Expense Breakdown for a Free tenant without requiring Pro", async () => {
    const loader = vi.fn().mockResolvedValue(dashboardFixture);
    const requirePro = vi.fn(async () => undefined);
    const billing: BillingRepository = {
      ...createAllowedBillingRepository(),
      getSummary: vi.fn(async () => ({
        plan: "free" as const,
        entitlementSource: null,
        provider: null,
        status: null,
        interval: null,
        currentPeriodEndsAt: null,
        scheduledChangeAt: null,
        cancelAtPeriodEnd: false,
        pendingCheckout: null,
        canCheckout: true,
        canManageBilling: false,
        canManageSponsoredSeats: false,
        nonTerminalSubscriptionCount: 0,
        usages: [],
        allowances: [{ resource: "custom_category" as const, used: 0, limit: 1 }],
      })),
      requirePro,
    };
    const app = createAppWithFakes({ billing, dashboardLoader: loader });
    const response = await app.request("/api/app/dashboard?from=2026-07-01&to=2026-07-31", {
      headers: AUTHORIZATION,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      spendingByCategory: dashboardFixture.spendingByCategory,
    });
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(requirePro).not.toHaveBeenCalled();
  });

  it("loads a validated cashflow view for the resolved tenant", async () => {
    const loader = vi.fn().mockResolvedValue(cashflowTrendFixture);
    const app = createAppWithFakes({ cashflowTrendLoader: loader });
    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=weekly&anchorDate=2026-07-27",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loader).toHaveBeenCalledWith(undefined, TENANT_ID, {
      view: "weekly",
      anchorDate: "2026-07-27",
    });
  });

  it("rejects invalid cashflow trend queries", async () => {
    const loader = vi.fn().mockResolvedValue(cashflowTrendFixture);
    const app = createAppWithFakes({ cashflowTrendLoader: loader });
    const response = await app.request(
      "/api/app/dashboard/cashflow-trend?view=yearly&anchorDate=2026-07-32",
      { headers: AUTHORIZATION },
    );

    expect(response.status).toBe(400);
    expect(loader).not.toHaveBeenCalled();
  });

  it("loads the transfer fee insight for the resolved tenant with a reference date", async () => {
    const insight = {
      hasFees: true,
      totalTransfers: 3,
      totalFeeChargedTransfers: 2,
      feesByCurrency: { PHP: 250, USD: 0 },
      weekly: [],
      recentWeekCount: 0,
      recentAverageTransfersPerWeek: 0,
      recentAverageFeeChargedTransfersPerWeek: 0,
    };
    const loader = vi.fn().mockResolvedValue(insight);
    const app = createAppWithFakes({ transferFeeLoader: loader });
    const response = await app.request("/api/app/dashboard/transfer-fees", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]?.[1]).toBe(TENANT_ID);
    expect(loader.mock.calls[0]?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(response.json()).resolves.toEqual(insight);
  });
});
