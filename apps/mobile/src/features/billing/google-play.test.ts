import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
} from "expo-iap";

import { ApiTransportError } from "@/api/billing";

import {
  buyOnGooglePlay,
  loadPlayOffers,
  restorePlayPurchases,
  settlePlayPurchase,
  type ReportPlayPurchase,
} from "./google-play";

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: "GPA.1",
    productId: "zoption_pro",
    purchaseToken: "token-1",
    purchaseState: "purchased",
    currentPlanId: "monthly",
    isAutoRenewing: true,
    quantity: 1,
    store: "play",
    storeId: "play",
    transactionDate: 0,
    ...overrides,
  } as Purchase;
}

const applied = { outcome: "applied" as const, subscription: null };

beforeEach(() => jest.clearAllMocks());

describe("loadPlayOffers", () => {
  it("keys each base plan by plan and interval with Play's recurring price", async () => {
    jest.mocked(fetchProducts).mockResolvedValue([
      {
        id: "zoption_budget",
        type: "subs",
        platform: "android",
        subscriptionOffers: [
          {
            id: "trial",
            basePlanIdAndroid: "monthly",
            offerTokenAndroid: "trial-token",
            displayPrice: "Free",
            pricingPhasesAndroid: {
              pricingPhaseList: [{ formattedPrice: "Free" }, { formattedPrice: "₱149.00" }],
            },
          },
          {
            id: "monthly",
            basePlanIdAndroid: "monthly",
            offerTokenAndroid: "monthly-token",
            displayPrice: "₱149.00",
            pricingPhasesAndroid: { pricingPhaseList: [{ formattedPrice: "₱149.00" }] },
          },
        ],
      },
    ] as never);

    const offers = await loadPlayOffers();

    expect(fetchProducts).toHaveBeenCalledWith({
      skus: ["zoption_budget", "zoption_pro", "zoption_family_budget", "zoption_family_pro"],
      type: "subs",
    });
    expect(offers.get("budget:month")).toEqual({ price: "₱149.00", offerToken: "monthly-token" });
    expect(offers.has("budget:year")).toBe(false);
  });
});

describe("buyOnGooglePlay", () => {
  it("launches the subscription with the account id and family, and resolves the purchase", async () => {
    let onPurchase: ((value: Purchase) => void) | undefined;
    jest.mocked(purchaseUpdatedListener).mockImplementation((listener) => {
      onPurchase = listener;
      return { remove: jest.fn() };
    });
    jest.mocked(requestPurchase).mockImplementation(async () => {
      onPurchase?.(purchase({ productId: "zoption_family_pro" }));
      return null;
    });

    const result = await buyOnGooglePlay({
      choice: { plan: "family_pro", interval: "year" },
      offerToken: "offer-token",
      obfuscatedAccountId: "a".repeat(64),
      familyId: "fam-1",
    });

    expect(result?.productId).toBe("zoption_family_pro");
    expect(requestPurchase).toHaveBeenCalledWith({
      type: "subs",
      request: {
        google: {
          skus: ["zoption_family_pro"],
          subscriptionOffers: [{ sku: "zoption_family_pro", offerToken: "offer-token" }],
          obfuscatedAccountId: "a".repeat(64),
          obfuscatedProfileId: "fam-1",
        },
      },
    });
  });

  it("resolves null when the buyer backs out of the Play sheet", async () => {
    let onError: ((value: { code: string; message: string }) => void) | undefined;
    jest.mocked(purchaseErrorListener).mockImplementation((listener) => {
      onError = listener as typeof onError;
      return { remove: jest.fn() };
    });
    jest.mocked(requestPurchase).mockImplementation(async () => {
      onError?.({ code: "user-cancelled", message: "Cancelled" });
      return null;
    });

    await expect(
      buyOnGooglePlay({
        choice: { plan: "pro", interval: "month" },
        offerToken: "offer-token",
        obfuscatedAccountId: "a".repeat(64),
        familyId: null,
      }),
    ).resolves.toBeNull();
  });
});

describe("settlePlayPurchase", () => {
  it("reports the picked base plan and acknowledges only after the Worker applies it", async () => {
    const report = jest.fn<ReturnType<ReportPlayPurchase>, Parameters<ReportPlayPurchase>>(
      async () => applied,
    );

    await expect(settlePlayPurchase(purchase(), report, "year")).resolves.toBe("applied");

    expect(report).toHaveBeenCalledWith({
      plan: "pro",
      familyId: null,
      body: { productId: "zoption_pro", basePlanId: "yearly", purchaseToken: "token-1" },
    });
    expect(finishTransaction).toHaveBeenCalledWith({
      purchase: expect.objectContaining({ purchaseToken: "token-1" }),
      isConsumable: false,
    });
  });

  it("leaves a pending payment unacknowledged", async () => {
    const report = jest.fn(async () => ({ outcome: "pending" as const, subscription: null }));

    await expect(
      settlePlayPurchase(purchase({ purchaseState: "pending" }), report, "month"),
    ).resolves.toBe("pending");
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it("does not acknowledge a purchase the Worker refused", async () => {
    const report = jest.fn(async () => {
      throw new ApiTransportError("Refused", "invalid_request", 403, "play_account_mismatch");
    });

    await expect(settlePlayPurchase(purchase(), report, "month")).rejects.toThrow("Refused");
    expect(finishTransaction).not.toHaveBeenCalled();
  });

  it("tries the other base plan when Play's guess does not match Google", async () => {
    const report = jest
      .fn<ReturnType<ReportPlayPurchase>, Parameters<ReportPlayPurchase>>()
      .mockRejectedValueOnce(
        new ApiTransportError("Mismatch", "conflict", 409, "play_purchase_mismatch"),
      )
      .mockResolvedValueOnce(applied);

    await expect(settlePlayPurchase(purchase(), report)).resolves.toBe("applied");
    expect(report.mock.calls.map(([input]) => input.body.basePlanId)).toEqual([
      "monthly",
      "yearly",
    ]);
  });

  it("sends a family plan to the family named in the purchase, and skips one without it", async () => {
    const report = jest.fn(async () => applied);
    const family = purchase({ productId: "zoption_family_budget" });

    await expect(settlePlayPurchase(family, report, "month")).resolves.toBeNull();
    expect(report).not.toHaveBeenCalled();

    await settlePlayPurchase(
      { ...family, obfuscatedProfileIdAndroid: "fam-1" } as Purchase,
      report,
      "month",
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "family_budget", familyId: "fam-1" }),
    );
  });

  it("ignores a product that is not Zoption's", async () => {
    const report = jest.fn(async () => applied);
    await expect(settlePlayPurchase(purchase({ productId: "other" }), report)).resolves.toBeNull();
    expect(report).not.toHaveBeenCalled();
  });
});

describe("restorePlayPurchases", () => {
  it("reports every owned purchase and keeps going past a refused one", async () => {
    jest
      .mocked(getAvailablePurchases)
      .mockResolvedValue([
        purchase({ purchaseToken: "refused" }),
        purchase({ purchaseToken: "ok" }),
      ]);
    const report = jest.fn<ReturnType<ReportPlayPurchase>, Parameters<ReportPlayPurchase>>(
      async ({ body }) => {
        if (body.purchaseToken === "refused") {
          throw new ApiTransportError("No", "invalid_request", 403, "play_test_purchase");
        }
        return applied;
      },
    );

    await expect(restorePlayPurchases(report)).resolves.toBe(true);
    expect(report).toHaveBeenCalledTimes(2);
    expect(finishTransaction).toHaveBeenCalledTimes(1);
  });
});
