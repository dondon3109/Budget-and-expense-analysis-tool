import { afterEach, describe, expect, it, vi } from "vitest";

import type { BillingTier } from "@zoption/shared";

import { isCategoryPlanAvailable, wireCategoryPlan } from "../src/billing/entitlements";
import {
  billingRepository,
  hasEffectiveProEntitlement,
  isCheckoutBlockingSubscription,
  isNonTerminalBillingStatus,
  isProBillingStatus,
} from "../src/db/billing";
import {
  customCategoryLimitError,
  getCustomCategoryAllowance,
  isMonthlyLimitDatabaseError,
  manilaMonth,
  nextManilaMonth,
} from "../src/db/billing-usage";
import type { Bindings } from "../src/types";

const TIER_RANK = { free: null, zoption_budget: 1, zoption_pro: 2 } as const;

/** Answers the tier lookup with `tier` and every count with `count`. */
function tierEnvironment(tier: BillingTier, count: number): Bindings {
  const database = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => {
          if (sql.includes("FROM effective_plan_access")) {
            const rank = TIER_RANK[tier];
            return rank ? { source: "paypal", rank, familyTenantId: null } : null;
          }
          if (sql.includes("COUNT(*)") || sql.includes("FROM billing_monthly_usage")) {
            return { count };
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        }),
      })),
    })),
  } as unknown as D1Database;
  return { DB: database };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("billing time and status helpers", () => {
  it("uses the Manila calendar month across the UTC day boundary", () => {
    expect(manilaMonth(new Date("2026-07-31T15:59:59.999Z"))).toBe("2026-07-01");
    expect(manilaMonth(new Date("2026-07-31T16:00:00.000Z"))).toBe("2026-08-01");
  });

  it("returns the next Manila month boundary as an exact UTC instant", () => {
    expect(nextManilaMonth(new Date("2026-07-31T15:59:59.999Z"))).toBe("2026-07-31T16:00:00.000Z");
    expect(nextManilaMonth(new Date("2026-07-31T16:00:00.000Z"))).toBe("2026-08-31T16:00:00.000Z");
    expect(nextManilaMonth(new Date("2026-12-15T00:00:00.000Z"))).toBe("2026-12-31T16:00:00.000Z");
  });

  it.each([
    ["active", true, true],
    ["trialing", true, true],
    ["past_due", false, true],
    ["paused", false, true],
    ["canceled", false, false],
  ] as const)("classifies %s subscriptions", (status, isPro, isNonTerminal) => {
    expect(isProBillingStatus(status)).toBe(isPro);
    expect(isNonTerminalBillingStatus(status)).toBe(isNonTerminal);
  });

  it.each([
    ["active", "2026-08-01T00:00:00.001Z", true],
    ["trialing", "2026-08-01T00:00:00.001Z", true],
    ["active", "2026-08-01T00:00:00.000Z", false],
    ["active", "2026-07-31T23:59:59.999Z", false],
    ["active", null, false],
    ["past_due", "2026-08-01T00:00:00.001Z", false],
  ] as const)("grants Pro only before an eligible period ends", (status, periodEnd, expected) => {
    expect(
      hasEffectiveProEntitlement(status, periodEnd, new Date("2026-08-01T00:00:00.000Z")),
    ).toBe(expected);
  });

  it("retains PayPal access through a future paid-through date after cancellation", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(hasEffectiveProEntitlement("canceled", "2026-08-01T00:00:00.001Z", now, true)).toBe(
      true,
    );
    expect(hasEffectiveProEntitlement("canceled", "2026-08-01T00:00:00.001Z", now, false)).toBe(
      false,
    );
  });

  it("blocks checkout and account deletion while canceled PayPal access remains paid", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isCheckoutBlockingSubscription("canceled", "2026-08-01T00:00:00.001Z", true, now)).toBe(
      true,
    );
    expect(isCheckoutBlockingSubscription("canceled", "2026-07-31T23:59:59.999Z", true, now)).toBe(
      false,
    );
  });

  it("unlocks a category's tag at its tier and above", () => {
    expect(isCategoryPlanAvailable("free", "free")).toBe(true);
    expect(isCategoryPlanAvailable("zoption_budget", "free")).toBe(false);
    expect(isCategoryPlanAvailable("zoption_budget", "zoption_budget")).toBe(true);
    expect(isCategoryPlanAvailable("zoption_pro", "zoption_budget")).toBe(false);
    expect(isCategoryPlanAvailable("zoption_pro", "zoption_pro")).toBe(true);
  });

  it("sends a Budget tag to installed apps as Pro", () => {
    expect(wireCategoryPlan("free")).toBe("free");
    expect(wireCategoryPlan("zoption_budget")).toBe("zoption_pro");
    expect(wireCategoryPlan("zoption_pro")).toBe("zoption_pro");
  });
});

describe("custom category allowances", () => {
  it.each([
    ["free", 0, 4],
    ["zoption_budget", 6, 10],
    ["zoption_pro", 18, null],
  ] as const)("gives %s a limit of %s custom categories", async (tier, used, limit) => {
    await expect(
      getCustomCategoryAllowance(tierEnvironment(tier, used), "user:user-1"),
    ).resolves.toEqual({ resource: "custom_category", used, limit });
  });

  it("returns a stable resource-limit response with current usage", async () => {
    await expect(
      customCategoryLimitError(tierEnvironment("free", 2), "user:user-1"),
    ).resolves.toMatchObject({
      status: 409,
      code: "resource_limit_reached",
      details: {
        resource: "custom_category",
        used: 2,
        limit: 4,
        billingPath: "/app/settings#plan-and-billing",
      },
    });
  });
});

describe("billing usage error mapping", () => {
  it("recognizes only the database limit sentinel", () => {
    expect(isMonthlyLimitDatabaseError(new Error("D1_ERROR: billing_monthly_limit_reached"))).toBe(
      true,
    );
    expect(isMonthlyLimitDatabaseError(new Error("BILLING_MONTHLY_LIMIT_REACHED"))).toBe(true);
    expect(isMonthlyLimitDatabaseError(new Error("monthly limit reached"))).toBe(false);
    expect(isMonthlyLimitDatabaseError("billing_monthly_limit_reached")).toBe(false);
  });

  it.each([
    { tier: "free", used: 1, limit: 1 },
    { tier: "zoption_budget", used: 5, limit: 5 },
    { tier: "zoption_pro", used: 10, limit: 10 },
  ] as const)(
    "maps the database sentinel to the stable $limit-import response",
    async ({ tier, used, limit }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
      const environment = tierEnvironment(tier, used);

      await expect(
        billingRepository.rethrowMonthlyImportUsageError(
          environment,
          "user:user-1",
          new Error("D1_ERROR: billing_monthly_limit_reached"),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: "monthly_limit_reached",
        message: "You have reached this month’s import limit.",
        details: {
          feature: "file_import",
          used,
          limit,
          periodKind: "calendar_month",
          periodStartedAt: "2026-06-30T16:00:00.000Z",
          resetsAt: "2026-07-31T16:00:00.000Z",
          billingPath: "/app/settings#plan-and-billing",
        },
      });
    },
  );

  it("rethrows unrelated database failures unchanged", async () => {
    const environment = tierEnvironment("free", 0);
    const failure = new Error("D1 unavailable");

    await expect(
      billingRepository.rethrowMonthlyImportUsageError(environment, "user:user-1", failure),
    ).rejects.toBe(failure);
  });
});
