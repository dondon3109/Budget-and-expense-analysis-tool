import { describe, expect, it } from "vitest";

import { buildLinkedSubscriptionCharge } from "../src/db/subscriptions";

describe("buildLinkedSubscriptionCharge", () => {
  it("maps a subscription to a negative expense charge on its next billing date", () => {
    const charge = buildLinkedSubscriptionCharge({
      tenantId: "user:test",
      subscriptionId: "subscription-1",
      accountId: "user:test:account:bank",
      categoryId: "user:test:category:entertainment",
      name: "Music streaming",
      amountMinor: 199_00,
      nextBillingDate: "2026-07-25",
    });

    expect(charge.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(charge.tenantId).toBe("user:test");
    expect(charge.subscriptionId).toBe("subscription-1");
    expect(charge.accountId).toBe("user:test:account:bank");
    expect(charge.categoryId).toBe("user:test:category:entertainment");
    expect(charge.description).toBe("Music streaming");
    expect(charge.date).toBe("2026-07-25");
    expect(charge.amountMinor).toBe(-199_00);
    expect(charge.kind).toBe("expense");
    expect(charge.currency).toBe("PHP");
    expect(charge.sourceKind).toBe("manual");
  });

  it("keeps yearly amounts as the full charge, not the monthly share", () => {
    const charge = buildLinkedSubscriptionCharge({
      tenantId: "user:test",
      subscriptionId: "subscription-2",
      accountId: "user:test:account:bank",
      categoryId: "user:test:category:entertainment",
      name: "Annual cloud storage",
      amountMinor: 1_299_00,
      nextBillingDate: "2026-08-15",
    });

    expect(charge.amountMinor).toBe(-1_299_00);
  });
});
