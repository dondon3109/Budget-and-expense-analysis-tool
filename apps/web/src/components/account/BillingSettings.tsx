import type { BillingInterval, BillingSubscriptionStatus, BillingSummary } from "@zoption/shared";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { createBillingPortalSession, getBillingSummary, startBillingCheckout } from "../../lib/api";
import { getPaddle } from "../../lib/paddle";
import { userWorkspace } from "../../lib/workspace";
import "./BillingSettings.css";

const CONFIRMATION_ATTEMPTS = 10;
const CONFIRMATION_INTERVAL_MS = 2_000;

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function statusCopy(
  status: BillingSubscriptionStatus | null | undefined,
  plan: BillingSummary["plan"] | undefined,
  confirming: boolean,
): { label: string; heading: string; description: string; tone: string } {
  if (confirming) {
    return {
      label: "Confirming payment",
      heading: "Confirming your payment",
      description:
        "Paddle is confirming your purchase. Paid access begins only after the signed notification reaches Zoption.",
      tone: "pending",
    };
  }

  switch (status) {
    case "active":
      return {
        label: "Zoption Pro",
        heading: "Zoption Pro is active",
        description: "Your paid access is confirmed and your Pro limits are available.",
        tone: "success",
      };
    case "trialing":
      return {
        label: "Pro trial",
        heading: "Your Zoption Pro trial is active",
        description: "Your trial currently includes Pro access and limits.",
        tone: "success",
      };
    case "past_due":
      return {
        label: "Payment issue",
        heading: "Your payment needs attention",
        description:
          "Paddle has reported a payment issue. Review your billing details to restore confirmed paid access.",
        tone: "warning",
      };
    case "paused":
      return {
        label: "Subscription paused",
        heading: "Your subscription is paused",
        description:
          "Pro access is not active while the subscription is paused. Use Paddle’s portal to review the subscription.",
        tone: "warning",
      };
    case "canceled":
      return {
        label: "Subscription ended",
        heading: "Your previous subscription has ended",
        description:
          "You can continue on the Free plan or start a new Pro subscription when eligible.",
        tone: "neutral",
      };
    default:
      return plan === "zoption_pro"
        ? {
            label: "Zoption Pro",
            heading: "Zoption Pro access is available",
            description: "Your current plan includes Pro limits.",
            tone: "success",
          }
        : {
            label: "Free plan",
            heading: "You’re using the Free plan",
            description: "Basic tracking stays free. Upgrade for higher AI and import limits.",
            tone: "neutral",
          };
  }
}

function periodLabel(summary: BillingSummary): string | undefined {
  if (summary.scheduledChangeAt) {
    return `Change scheduled ${formatPlanDate(summary.scheduledChangeAt)}`;
  }
  if (!summary.currentPeriodEndsAt) return undefined;
  if (summary.status === "trialing")
    return `Trial ends ${formatPlanDate(summary.currentPeriodEndsAt)}`;
  if (summary.status === "active") return `Renews ${formatPlanDate(summary.currentPeriodEndsAt)}`;
  return `Period ends ${formatPlanDate(summary.currentPeriodEndsAt)}`;
}

export function BillingSettings({ user }: { user: User }) {
  const workspace = userWorkspace(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutCompleted = searchParams.get("checkout") === "completed";
  const [summary, setSummary] = useState<BillingSummary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<BillingInterval>();
  const [portalBusy, setPortalBusy] = useState(false);
  const [confirming, setConfirming] = useState(checkoutCompleted);
  const [confirmationDelayed, setConfirmationDelayed] = useState(false);

  async function refresh() {
    try {
      setSummary(await getBillingSummary(workspace));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your plan could not be loaded.");
    }
  }

  useEffect(() => {
    if (!checkoutCompleted) void refresh();
  }, [checkoutCompleted, user.id]); // The workspace changes only when the signed-in identity changes.

  useEffect(() => {
    if (!checkoutCompleted) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    setConfirming(true);
    setConfirmationDelayed(false);
    setError(undefined);

    async function confirmPayment() {
      attempts += 1;
      try {
        const nextSummary = await getBillingSummary(workspace);
        if (cancelled) return;
        setSummary(nextSummary);
        if (
          nextSummary.plan === "zoption_pro" &&
          (nextSummary.status === "active" || nextSummary.status === "trialing")
        ) {
          setConfirming(false);
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.delete("checkout");
              return next;
            },
            { replace: true },
          );
          return;
        }
      } catch (cause) {
        if (cancelled) return;
        if (attempts >= CONFIRMATION_ATTEMPTS) {
          setError(cause instanceof Error ? cause.message : "Your plan could not be refreshed.");
        }
      }

      if (attempts >= CONFIRMATION_ATTEMPTS) {
        setConfirming(false);
        setConfirmationDelayed(true);
        return;
      }
      timer = setTimeout(() => void confirmPayment(), CONFIRMATION_INTERVAL_MS);
    }

    void confirmPayment();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutCompleted, setSearchParams, user.id]);

  async function beginCheckout(interval: BillingInterval) {
    if (!summary?.canCheckout) return;
    setBusy(interval);
    setError(undefined);
    try {
      const checkout = await startBillingCheckout(workspace, interval);
      const paddle = await getPaddle();
      if (!paddle) throw new Error("Paddle checkout could not be loaded.");
      const successUrl = new URL("/app/settings", window.location.origin);
      successUrl.searchParams.set("checkout", "completed");
      paddle.Checkout.open({
        items: [{ priceId: checkout.priceId, quantity: 1 }],
        customer: user.email ? { email: user.email } : undefined,
        customData: { zoption_checkout_reference: checkout.reference },
        settings: {
          displayMode: "overlay",
          variant: "one-page",
          theme: "light",
          successUrl: successUrl.toString(),
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be opened.");
    } finally {
      setBusy(undefined);
    }
  }

  async function openBillingPortal() {
    if (!summary?.canManageBilling) return;
    setPortalBusy(true);
    setError(undefined);
    try {
      const portal = await createBillingPortalSession(workspace);
      window.location.assign(portal.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The billing portal could not be opened.");
      setPortalBusy(false);
    }
  }

  const presentation = statusCopy(summary?.status, summary?.plan, confirming);
  const isPro = summary?.plan === "zoption_pro";
  const duplicateSubscriptions = (summary?.nonTerminalSubscriptionCount ?? 0) > 1;
  const canCheckout = summary?.canCheckout === true;
  const canManageBilling = summary?.canManageBilling === true;
  const billingPeriodLabel = summary ? periodLabel(summary) : undefined;

  return (
    <section
      id="plan-and-billing"
      className="settings-section billing-settings"
      aria-labelledby="billing-settings-title"
      tabIndex={-1}
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="billing-settings-title">Plan and billing</h2>
          <p>Review your limits and upgrade only when Zoption Pro is useful for your workflow.</p>
        </div>
        <span>{presentation.label}</span>
      </div>
      <div
        className="billing-settings-overview"
        data-tone={presentation.tone}
        aria-busy={(!summary && !error) || confirming}
        aria-live="polite"
      >
        <div>
          <strong>{summary || confirming ? presentation.heading : "Loading your plan"}</strong>
          <p>
            {summary || confirming
              ? presentation.description
              : error
                ? "Your current billing state is temporarily unavailable."
                : "Checking your plan and monthly usage."}
          </p>
        </div>
        {billingPeriodLabel && <small>{billingPeriodLabel}</small>}
      </div>
      {summary && (
        <ul className="billing-usage" aria-label="Monthly plan usage">
          {summary.usages.map((item) => (
            <li key={item.feature}>
              <span>{item.feature === "assistant_question" ? "AI questions" : "File imports"}</span>
              <strong>
                {item.used} / {item.limit}
              </strong>
              <small>Resets {formatPlanDate(item.resetsAt)}</small>
            </li>
          ))}
        </ul>
      )}
      {duplicateSubscriptions && (
        <p className="billing-settings-warning" role="alert">
          Paddle reports more than one ongoing subscription for this account. Review billing before
          starting another checkout or deleting your Zoption account.
        </p>
      )}
      {(canCheckout || canManageBilling) && (
        <div className="billing-settings-actions">
          {canCheckout && (
            <>
              <button
                className="button primary compact"
                type="button"
                disabled={Boolean(busy) || confirming}
                onClick={() => void beginCheckout("month")}
              >
                {busy === "month" ? "Opening checkout…" : "Upgrade monthly · $2.99"}
              </button>
              <button
                className="button secondary compact"
                type="button"
                disabled={Boolean(busy) || confirming}
                onClick={() => void beginCheckout("year")}
              >
                {busy === "year" ? "Opening checkout…" : "Upgrade annually · $24.99"}
              </button>
            </>
          )}
          {canManageBilling && (
            <button
              className="button secondary compact"
              type="button"
              disabled={portalBusy}
              onClick={() => void openBillingPortal()}
            >
              {portalBusy ? "Opening billing portal…" : "Manage billing"}
            </button>
          )}
          <small>
            {canCheckout
              ? "Prices are charged in USD. Your bank may show an approximate PHP conversion. Paddle securely hosts checkout."
              : "Paddle securely hosts payment-method updates, invoices, and subscription management."}
          </small>
        </div>
      )}
      {summary && !isPro && !canCheckout && canManageBilling && (
        <p className="settings-helper">
          A new checkout is unavailable while this subscription state is being resolved. Use Manage
          billing to review it in Paddle.
        </p>
      )}
      {summary && !isPro && !canCheckout && !canManageBilling && (
        <p className="settings-helper">
          Upgrade and billing management are temporarily unavailable. Refresh the page or contact
          support if this continues.
        </p>
      )}
      {confirmationDelayed && (
        <p className="settings-helper" role="status">
          Payment confirmation is taking longer than expected. You can safely refresh this page in a
          moment—Paddle’s signed notification will update your plan automatically.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
