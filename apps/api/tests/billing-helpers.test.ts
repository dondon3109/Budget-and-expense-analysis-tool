import { afterEach, describe, expect, it, vi } from "vitest";

import {
  billingRepository,
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
