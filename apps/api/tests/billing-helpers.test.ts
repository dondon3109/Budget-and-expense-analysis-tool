import { afterEach, describe, expect, it, vi } from "vitest";

import {
  billingRepository,
  customCategoryLimitError,
  getCustomCategoryAllowance,
  hasEffectiveProEntitlement,
  isCategoryPlanAvailable,
  isMonthlyLimitDatabaseError,
  isNonTerminalBillingStatus,
  isProBillingStatus,
  manilaMonth,
  nextManilaMonth,
} from "../src/db/billing";
import type { Bindings } from "../src/types";

function usageEnvironment(options: { pro: boolean; used: number }): Bindings {
  const database = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => {
          if (sql.includes("status IN ('active', 'trialing')")) {
            return options.pro ? { found: 1 } : null;
          }
          if (sql.includes("FROM billing_monthly_usage")) return { count: options.used };
          if (sql.includes("FROM effective_pro_entitlements")) {
            return options.pro ? { source: "paddle" } : null;
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

  it("locks Pro-required categories when the entitlement is unavailable", () => {
    expect(isCategoryPlanAvailable("free", false)).toBe(true);
    expect(isCategoryPlanAvailable("zoption_pro", true)).toBe(true);
    expect(isCategoryPlanAvailable("zoption_pro", false)).toBe(false);
  });
});

describe("custom category allowances", () => {
  function categoryEnvironment(used: number): Bindings {
    return {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ first: vi.fn(async () => ({ count: used })) })),
        })),
      } as unknown as D1Database,
    };
  }

  it("returns one Free custom category and unlimited Pro categories", async () => {
    await expect(
      getCustomCategoryAllowance(categoryEnvironment(0), "user:user-1", false),
    ).resolves.toEqual({
      resource: "custom_category",
      used: 0,
      limit: 1,
    });
    await expect(
      getCustomCategoryAllowance(categoryEnvironment(8), "user:user-1", true),
    ).resolves.toEqual({
      resource: "custom_category",
      used: 8,
      limit: null,
    });
  });

  it("returns a stable resource-limit response with current usage", async () => {
    await expect(
      customCategoryLimitError(categoryEnvironment(2), "user:user-1"),
    ).resolves.toMatchObject({
      status: 409,
      code: "resource_limit_reached",
      details: {
        resource: "custom_category",
        used: 2,
        limit: 1,
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
    { pro: false, used: 4, limit: 4 },
    { pro: true, used: 100, limit: 100 },
  ])(
    "maps the database sentinel to the stable $limit-question response",
    async ({ pro, used, limit }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
      const environment = usageEnvironment({ pro, used });

      await expect(
        billingRepository.rethrowUsageError(
          environment,
          "user:user-1",
          "assistant_question",
          new Error("D1_ERROR: billing_monthly_limit_reached"),
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: "monthly_limit_reached",
        message: "You have reached this month’s plan limit.",
        details: {
          feature: "assistant_question",
          used,
          limit,
          resetsAt: "2026-07-31T16:00:00.000Z",
          billingPath: "/app/settings",
        },
      });
    },
  );

  it("rethrows unrelated database failures unchanged", async () => {
    const environment = usageEnvironment({ pro: false, used: 0 });
    const failure = new Error("D1 unavailable");

    await expect(
      billingRepository.rethrowUsageError(
        environment,
        "user:user-1",
        "assistant_question",
        failure,
      ),
    ).rejects.toBe(failure);
  });
});
