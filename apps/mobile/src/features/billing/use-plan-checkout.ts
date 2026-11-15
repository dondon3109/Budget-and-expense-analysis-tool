import * as WebBrowser from "expo-web-browser";
import { PLAN_NAMES, type BillingProvider, type BillingSummary } from "@zoption/shared";
import { useCallback, useState } from "react";

import {
  ApiTransportError,
  changeBillingPlan,
  getGooglePlayAccountId,
  reconcileBillingCheckout,
  reportGooglePlayPurchase,
  startBillingCheckout,
  type PlanChoice,
} from "@/api/billing";
import { clearPlanCache } from "@/auth/plan-state";
import { useSessionSnapshot } from "@/auth/session-state";
import { showThankYou } from "@/features/thank-you/ThankYouHost";

import {
  buyOnGooglePlay,
  loadPlayOffers,
  PlayBillingError,
  playOfferKey,
  settlePlayPurchase,
  type ReportPlayPurchase,
} from "./google-play";

const RECONCILE_ATTEMPTS = 8;
const RECONCILE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CheckoutBusy =
  "checkout" | "dodo-checkout" | "play-checkout" | "change" | "reconcile" | "cancel";

/** What a refused plan change or cancel says when Google Play bills the plan. */
export const MANAGED_IN_GOOGLE_PLAY_MESSAGE =
  "This plan is billed through Google Play. Change or cancel it in Google Play.";

/** The message for a failed billing call, naming Google Play when it owns the subscription. */
export function billingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiTransportError && error.serverCode === "managed_in_google_play") {
    return MANAGED_IN_GOOGLE_PLAY_MESSAGE;
  }
  if (error instanceof ApiTransportError || error instanceof PlayBillingError) {
    return error.message;
  }
  return fallback;
}

/**
 * Checkout, plan change, and payment confirmation for the personal plan (`familyId` null) or
 * the plan of the family `familyId` names. Confirmation always goes through the personal
 * reconcile, which also settles a family checkout. `onSettled` runs once a write may have
 * changed the plan, with the personal summary when the server returned one.
 */
export function usePlanCheckout(
  familyId: string | null,
  onSettled: (summary: BillingSummary | null) => void,
) {
  const session = useSessionSnapshot();
  const [busy, setBusy] = useState<CheckoutBusy | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const withToken = useCallback(
    async <T>(operation: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(await session.getAccessToken(false));
      } catch (error) {
        if (error instanceof ApiTransportError && error.code === "session_expired") {
          return operation(await session.getAccessToken(true));
        }
        throw error;
      }
    },
    [session],
  );

  const api = useCallback(
    (token: string) =>
      familyId ? { accessToken: token, workspaceId: familyId } : { accessToken: token },
    [familyId],
  );

  const reconcile = useCallback(async (): Promise<void> => {
    for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt += 1) {
      try {
        const result = await withToken((token) => reconcileBillingCheckout({ accessToken: token }));
        if (result.outcome === "confirmed") {
          onSettled(result.summary);
          setMessage("Your subscription is active. Thank you for upgrading.");
          showThankYou("pro");
          return;
        }
        if (result.outcome === "closed" || result.outcome === "none") {
          onSettled(result.summary);
          setMessage("Payment was not confirmed yet. Try again or check back shortly.");
          return;
        }
        if (result.outcome === "review_required") {
          onSettled(result.summary);
          setMessage("Zoption is reviewing your payment. Paid access is pending.");
          return;
        }
      } catch (error) {
        setMessage(
          error instanceof ApiTransportError ? error.message : "Payment status is unknown.",
        );
        return;
      }
      await sleep(RECONCILE_DELAY_MS);
    }
    setMessage("Payment confirmation is still in progress. Check back shortly.");
  }, [onSettled, withToken]);

  const checkPayment = useCallback(async () => {
    setBusy("reconcile");
    setMessage(null);
    try {
      await reconcile();
    } finally {
      setBusy(null);
    }
  }, [reconcile]);

  const reportToZoption = useCallback<ReportPlayPurchase>(
    ({ plan, familyId: purchaseFamilyId, body }) =>
      withToken((token) =>
        reportGooglePlayPurchase(
          purchaseFamilyId
            ? { accessToken: token, workspaceId: purchaseFamilyId }
            : { accessToken: token },
          plan,
          body,
        ),
      ),
    [withToken],
  );

  // Play build only: buy through Google Play, then let the Worker verify the purchase.
  const playCheckout = useCallback(
    async (choice: PlanChoice) => {
      const offer = (await loadPlayOffers()).get(playOfferKey(choice));
      if (!offer) throw new PlayBillingError("Google Play does not offer this plan right now.");
      const obfuscatedAccountId = await withToken((token) =>
        getGooglePlayAccountId({ accessToken: token }),
      );
      const purchase = await buyOnGooglePlay({
        choice,
        offerToken: offer.offerToken,
        obfuscatedAccountId,
        familyId,
      });
      if (!purchase) {
        setMessage("Purchase canceled. You were not charged.");
        return;
      }
      const outcome = await settlePlayPurchase(purchase, reportToZoption, choice.interval);
      clearPlanCache();
      onSettled(null);
      if (outcome === "applied") {
        setMessage("Your subscription is active. Thank you for upgrading.");
        showThankYou("pro");
        return;
      }
      setMessage("Google Play is still processing your payment. Your plan starts once it clears.");
    },
    [familyId, onSettled, reportToZoption, withToken],
  );

  const checkout = useCallback(
    async (choice: PlanChoice, provider: BillingProvider) => {
      if (provider === "google_play") {
        setBusy("play-checkout");
        setMessage(null);
        try {
          await playCheckout(choice);
        } catch (error) {
          setMessage(billingErrorMessage(error, "Google Play could not complete the purchase."));
        } finally {
          setBusy(null);
        }
        return;
      }
      setBusy(provider === "dodo" ? "dodo-checkout" : "checkout");
      setMessage(null);
      try {
        const { approvalUrl } = await withToken((token) =>
          startBillingCheckout(api(token), choice, provider),
        );
        await WebBrowser.openBrowserAsync(approvalUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        await reconcile();
      } catch (error) {
        setMessage(
          error instanceof ApiTransportError ? error.message : "Checkout could not start.",
        );
      } finally {
        setBusy(null);
      }
    },
    [api, playCheckout, reconcile, withToken],
  );

  const change = useCallback(
    async (choice: PlanChoice) => {
      setBusy("change");
      setMessage(null);
      try {
        const response = await withToken((token) => changeBillingPlan(api(token), choice));
        // A PayPal-balance subscriber approves the new price on PayPal before it applies.
        if (response.approvalUrl) {
          await WebBrowser.openBrowserAsync(response.approvalUrl, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          });
        }
        onSettled(null);
        setMessage(
          response.outcome === "scheduled"
            ? `You move to ${PLAN_NAMES[choice.plan]} when the paid period ends.`
            : `You’re now on ${PLAN_NAMES[choice.plan]}.`,
        );
      } catch (error) {
        setMessage(billingErrorMessage(error, "The plan could not be changed."));
      } finally {
        setBusy(null);
      }
    },
    [api, onSettled, withToken],
  );

  return { busy, setBusy, message, setMessage, withToken, checkout, change, checkPayment };
}
