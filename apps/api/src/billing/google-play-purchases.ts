import {
  googlePlayPlan,
  isFamilyPlan,
  type GooglePlayPurchaseRequest,
  type GooglePlayPurchaseResponse,
} from "@zoption/shared";

import type { GooglePlayRepository } from "../db/google-play";
import { HttpError } from "../errors";
import type { Bindings } from "../types";
import {
  acknowledgeGooglePlaySubscription,
  getGooglePlaySubscription,
  googlePlayAccountId,
  googlePlaySnapshot,
  isGooglePlayConfigured,
  normalizeGooglePlayState,
  type GooglePlayPurchase,
} from "./google-play";

// Verifying a Play purchase for the person who paid, and re-reading live Play subscriptions.
// Without Real-time developer notifications (Pub/Sub), the Worker learns about renewals,
// cancellations, and refunds only from these reads: the app reports its purchase after buying
// and on every open, and the five-minute cron rechecks what is due. An RTDN push endpoint would
// call `refreshGooglePlayPurchase` with the token a notification names.

export interface GooglePlayPayer {
  /** The Supabase user who bought; their id derives the purchase's `obfuscatedAccountId`. */
  userId: string;
  /** The payer's personal workspace, which owns the subscription row. */
  tenantId: string;
  /** The family a family plan covers; null for a personal plan. */
  familyTenantId: string | null;
}

/** A purchase that unlocks a plan must be acknowledged or Google refunds it. */
function needsAcknowledgement(purchase: GooglePlayPurchase): boolean {
  const state = normalizeGooglePlayState(purchase.state);
  return (
    !purchase.acknowledged && state !== null && state !== "pending" && state.status === "active"
  );
}

export async function verifyGooglePlayPurchase(
  repository: GooglePlayRepository,
  env: Bindings,
  payer: GooglePlayPayer,
  request: GooglePlayPurchaseRequest,
): Promise<GooglePlayPurchaseResponse> {
  if (!isGooglePlayConfigured(env)) {
    throw new HttpError(
      503,
      "billing_not_configured",
      "Google Play billing is not configured yet.",
    );
  }
  const requested = googlePlayPlan(request.productId, request.basePlanId);
  if (!requested || isFamilyPlan(requested.plan) !== (payer.familyTenantId !== null)) {
    throw new HttpError(400, "invalid_request", "Choose a plan that matches the workspace.");
  }

  const purchase = await getGooglePlaySubscription(env, request.purchaseToken);
  if (!purchase) {
    throw new HttpError(404, "play_purchase_not_found", "Google Play has no such purchase.");
  }
  if (purchase.productId !== request.productId || purchase.basePlanId !== request.basePlanId) {
    throw new HttpError(409, "play_purchase_mismatch", "This purchase is for a different plan.");
  }
  // The app sets the payer's id on every purchase, so a token reported by anyone else, or one
  // bought without it, is refused rather than granted.
  if (purchase.obfuscatedAccountId !== (await googlePlayAccountId(payer.userId))) {
    throw new HttpError(
      403,
      "play_account_mismatch",
      "This Google Play purchase belongs to another Zoption account.",
    );
  }
  if (purchase.testPurchase && env.GOOGLE_PLAY_ALLOW_TEST_PURCHASES !== "true") {
    throw new HttpError(403, "play_test_purchase", "Test purchases are not accepted here.");
  }
  if (normalizeGooglePlayState(purchase.state) === "pending") {
    return { outcome: "pending", subscription: null };
  }

  const outcome = await repository.applyPurchase(env, googlePlaySnapshot(env, purchase), {
    tenantId: payer.tenantId,
    familyTenantId: payer.familyTenantId,
  });
  if (outcome === "rejected_plan" || outcome === "unmatched") {
    throw new HttpError(409, "play_purchase_rejected", "This purchase cannot be applied here.");
  }
  if (purchase.linkedPurchaseToken) {
    await repository.supersedePurchase(env, payer.tenantId, purchase.linkedPurchaseToken);
  }
  // After storing, so a failed acknowledgement is retried by the next report or recheck.
  if (needsAcknowledgement(purchase)) await acknowledgeGooglePlaySubscription(env, purchase);

  return {
    outcome: "applied",
    subscription: await repository.getPurchase(env, payer.tenantId, request.purchaseToken),
  };
}

/** Re-reads a stored token from Google and applies what it says now. */
export async function refreshGooglePlayPurchase(
  repository: GooglePlayRepository,
  env: Bindings,
  purchaseToken: string,
): Promise<"updated" | "expired"> {
  const purchase = await getGooglePlaySubscription(env, purchaseToken);
  if (!purchase) {
    await repository.expirePurchase(env, purchaseToken);
    return "expired";
  }
  if (normalizeGooglePlayState(purchase.state) !== "pending") {
    await repository.applyPurchase(env, googlePlaySnapshot(env, purchase));
  }
  if (needsAcknowledgement(purchase)) await acknowledgeGooglePlaySubscription(env, purchase);
  return "updated";
}

export interface GooglePlayRecheckResult {
  checked: number;
  updated: number;
  expired: number;
  failed: number;
}

/** Rechecks live Play subscriptions at least daily, and soon after a period ends. */
export async function recheckGooglePlaySubscriptions(
  repository: GooglePlayRepository,
  env: Bindings,
  limit = 25,
): Promise<GooglePlayRecheckResult> {
  const result: GooglePlayRecheckResult = { checked: 0, updated: 0, expired: 0, failed: 0 };
  if (!isGooglePlayConfigured(env)) return result;
  for (const purchaseToken of await repository.listDuePurchases(env, limit)) {
    result.checked += 1;
    try {
      result[await refreshGooglePlayPurchase(repository, env, purchaseToken)] += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        JSON.stringify({
          message: "Google Play subscription recheck failed",
          errorCode: error instanceof HttpError ? error.code : "unknown_error",
        }),
      );
    }
  }
  return result;
}
