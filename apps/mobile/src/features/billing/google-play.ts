import {
  billingIntervals,
  GOOGLE_PLAY_BASE_PLAN_IDS,
  GOOGLE_PLAY_PRODUCT_IDS,
  googlePlayPlan,
  isFamilyPlan,
  type BillingInterval,
  type BillingPlanKey,
  type GooglePlayPurchaseRequest,
  type GooglePlayPurchaseResponse,
} from "@zoption/shared";
import Constants from "expo-constants";
import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getUserFriendlyErrorMessage,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type SubscriptionOffer,
} from "expo-iap";
import { Linking } from "react-native";

import { ApiTransportError, type PlanChoice } from "@/api/billing";

// Google Play Billing for the Play build (`isPlayDistribution()`). Every call here talks to the
// Play Store on the device; the Worker verifies each purchase with Google before granting a plan.

export interface PlayOffer {
  /** Play's localized recurring price, such as "₱149.00". */
  price: string;
  offerToken: string;
}

export type PlayOffers = ReadonlyMap<string, PlayOffer>;

export function playOfferKey(choice: PlanChoice): string {
  return `${choice.plan}:${choice.interval}`;
}

let connection: Promise<unknown> | null = null;

function connect(): Promise<unknown> {
  connection ??= initConnection().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** The plain base plan offer (one pricing phase) when Play lists one, else the first offer. */
function baseOffer(offers: readonly SubscriptionOffer[], basePlanId: string) {
  const candidates = offers.filter(
    (offer) => offer.basePlanIdAndroid === basePlanId && offer.offerTokenAndroid,
  );
  return (
    candidates.find((offer) => offer.pricingPhasesAndroid?.pricingPhaseList.length === 1) ??
    candidates[0]
  );
}

/** Every plan and interval Play sells to this user, with its price and offer token. */
export async function loadPlayOffers(): Promise<PlayOffers> {
  await connect();
  const products = await fetchProducts({
    skus: Object.values(GOOGLE_PLAY_PRODUCT_IDS),
    type: "subs",
  });
  const offers = new Map<string, PlayOffer>();
  for (const product of products ?? []) {
    if (product.type !== "subs" || product.platform !== "android") continue;
    for (const interval of billingIntervals) {
      const basePlanId = GOOGLE_PLAY_BASE_PLAN_IDS[interval];
      const plan = googlePlayPlan(product.id, basePlanId)?.plan;
      const offer = baseOffer(product.subscriptionOffers, basePlanId);
      if (!plan || !offer?.offerTokenAndroid) continue;
      const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
      offers.set(playOfferKey({ plan, interval }), {
        price: phases.at(-1)?.formattedPrice ?? offer.displayPrice,
        offerToken: offer.offerTokenAndroid,
      });
    }
  }
  return offers;
}

export class PlayBillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayBillingError";
  }
}

/**
 * Opens the Play purchase sheet and resolves with the purchase, or null when the buyer backs
 * out. A family plan carries the family id as `obfuscatedProfileId`, so a purchase reported again
 * on a later app open still reaches the family it was bought for.
 */
export async function buyOnGooglePlay(input: {
  choice: PlanChoice;
  offerToken: string;
  obfuscatedAccountId: string;
  familyId: string | null;
}): Promise<Purchase | null> {
  await connect();
  const sku = GOOGLE_PLAY_PRODUCT_IDS[input.choice.plan];
  return new Promise<Purchase | null>((resolve, reject) => {
    const settle = (finish: () => void) => {
      updated.remove();
      failed.remove();
      finish();
    };
    const updated = purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== sku) return;
      settle(() => resolve(purchase));
    });
    const failed = purchaseErrorListener((error) => {
      settle(() =>
        isUserCancelledError(error)
          ? resolve(null)
          : reject(new PlayBillingError(getUserFriendlyErrorMessage(error))),
      );
    });
    requestPurchase({
      type: "subs",
      request: {
        google: {
          skus: [sku],
          subscriptionOffers: [{ sku, offerToken: input.offerToken }],
          obfuscatedAccountId: input.obfuscatedAccountId,
          obfuscatedProfileId: input.familyId,
        },
      },
    }).catch((error: unknown) => {
      settle(() =>
        isUserCancelledError(error)
          ? resolve(null)
          : reject(new PlayBillingError("Google Play could not start the purchase.")),
      );
    });
  });
}

export type ReportPlayPurchase = (input: {
  plan: BillingPlanKey;
  familyId: string | null;
  body: GooglePlayPurchaseRequest;
}) => Promise<GooglePlayPurchaseResponse>;

/**
 * Reports one Play subscription to the Worker and acknowledges it with Play only once the
 * Worker answers `applied`, so a purchase Zoption never recorded is left for Google to refund.
 * Google's purchase does not say which base plan was bought, so `interval` is the one the buyer
 * picked; without it (a purchase found on app open) the library's guess is tried first and the
 * other base plan after a `play_purchase_mismatch`. Returns null for a purchase that is not
 * Zoption's or a family purchase that does not name its family.
 */
export async function settlePlayPurchase(
  purchase: Purchase,
  report: ReportPlayPurchase,
  interval?: BillingInterval,
): Promise<GooglePlayPurchaseResponse["outcome"] | null> {
  const plan = googlePlayPlan(purchase.productId, GOOGLE_PLAY_BASE_PLAN_IDS.month)?.plan;
  const purchaseToken = purchase.purchaseToken;
  if (!plan || !purchaseToken) return null;
  const familyId =
    "obfuscatedProfileIdAndroid" in purchase ? (purchase.obfuscatedProfileIdAndroid ?? null) : null;
  if (isFamilyPlan(plan) && !familyId) return null;

  const guessed = billingIntervals.find(
    (key) => GOOGLE_PLAY_BASE_PLAN_IDS[key] === purchase.currentPlanId,
  );
  const first = interval ?? guessed ?? "month";
  const attempts = interval ? [first] : [first, ...billingIntervals.filter((key) => key !== first)];

  let response: GooglePlayPurchaseResponse | null = null;
  for (const attempt of attempts) {
    try {
      response = await report({
        plan,
        familyId: isFamilyPlan(plan) ? familyId : null,
        body: {
          productId: purchase.productId,
          basePlanId: GOOGLE_PLAY_BASE_PLAN_IDS[attempt],
          purchaseToken,
        },
      });
      break;
    } catch (error) {
      const mismatch =
        error instanceof ApiTransportError && error.serverCode === "play_purchase_mismatch";
      if (!mismatch || attempt === attempts.at(-1)) throw error;
    }
  }
  if (response?.outcome === "applied" && purchase.purchaseState === "purchased") {
    await finishTransaction({ purchase, isConsumable: false });
  }
  return response?.outcome ?? null;
}

/**
 * Reports every Zoption subscription Play holds for this device's Google account, so a purchase
 * that was interrupted before the Worker saw it still unlocks the plan. Resolves true when any
 * report was applied.
 */
export async function restorePlayPurchases(report: ReportPlayPurchase): Promise<boolean> {
  await connect();
  const owned = await getAvailablePurchases();
  let applied = false;
  for (const purchase of owned) {
    try {
      if ((await settlePlayPurchase(purchase, report)) === "applied") applied = true;
    } catch {
      // One refused purchase (another account's, a test purchase) must not block the rest.
    }
  }
  return applied;
}

/** Play's subscription center for this plan's product, where Play subscribers change or cancel. */
export function openPlaySubscriptions(plan: BillingPlanKey | null): Promise<void> {
  const url = new URL("https://play.google.com/store/account/subscriptions");
  const packageName = Constants.expoConfig?.android?.package;
  if (plan && packageName) {
    url.searchParams.set("sku", GOOGLE_PLAY_PRODUCT_IDS[plan]);
    url.searchParams.set("package", packageName);
  }
  return Linking.openURL(url.toString());
}
