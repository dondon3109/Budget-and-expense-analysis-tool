import {
  PLAN_NAMES,
  PLAN_TIER,
  TIER_NAMES,
  familyBillingPlans,
  type FamilyBillingSummary,
  type FamilyDetail,
} from "@zoption/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { cancelFamilyPlan, reconcileBillingCheckout } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { personalWorkspace, type AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamilyBillingSummary } from "../../queries/billing";
import { PlanCheckoutDialog } from "../billing/PlanCheckoutDialog";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { formatFamilyDate } from "./familyLabels";
import { JustYouCard } from "./JustYouCard";

const CONFIRMATION_ATTEMPTS = 20;
const CONFIRMATION_INTERVAL_MS = 3_000;

/** Why the owner cannot start a family checkout; null when they can. */
function checkoutUnavailable(summary: FamilyBillingSummary): string | null {
  if (summary.canCheckout) return null;
  if (summary.pendingCheckout) return "A family payment is still being confirmed.";
  return "Finish or cancel your other checkout before buying a family plan.";
}

/**
 * The family's plan. The owner buys, changes, and cancels it here; everyone else sees what it
 * gives them. A provider sends the owner back with `familyCheckout`, and the section confirms
 * the payment through the owner's personal reconcile, where the checkout lives.
 */
export function FamilyPlanSection({
  family,
  detail,
}: {
  family: AuthenticatedWorkspace;
  detail: FamilyDetail;
}) {
  const owner = detail.role === "owner";
  const queryClient = useQueryClient();
  const billing = useFamilyBillingSummary(family, owner);
  const [searchParams, setSearchParams] = useSearchParams();
  const returned = searchParams.get("familyCheckout");
  const [dialog, setDialog] = useState<"checkout" | "change" | "cancel">();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const openerRef = useRef<HTMLButtonElement>(null);
  const summary = billing.data;
  const confirming = Boolean(owner && (returned === "completed" || summary?.pendingCheckout));

  // The provider confirms asynchronously, so poll until the family is paid or attempts run out.
  useEffect(() => {
    if (!owner || returned === "cancelled" || !confirming) return;
    const personal = personalWorkspace(family);
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function confirm() {
      attempts += 1;
      try {
        await reconcileBillingCheckout(personal);
        const next = await billing.refetch();
        if (cancelled) return;
        if (next.data?.state === "active" && !next.data.pendingCheckout) {
          setNotice(`${PLAN_NAMES[next.data.plan ?? "family_budget"]} is active.`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.family(family) });
          setSearchParams({}, { replace: true });
          return;
        }
      } catch {
        // Keep polling; the last attempt reports below.
      }
      if (cancelled) return;
      if (attempts >= CONFIRMATION_ATTEMPTS) {
        setError("The payment is still being confirmed. Check back in a few minutes.");
        return;
      }
      timer = setTimeout(() => void confirm(), CONFIRMATION_INTERVAL_MS);
    }

    void confirm();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `billing.refetch` is stable; the summary itself would restart the loop on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, family, owner, queryClient, returned, setSearchParams]);

  // Leaving checkout unpaid closes it at once, so the owner can start again.
  useEffect(() => {
    if (!owner || returned !== "cancelled") return;
    setSearchParams({}, { replace: true });
    void reconcileBillingCheckout(personalWorkspace(family), { abortPendingCheckout: true })
      .catch(() => undefined)
      .then(() => billing.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, owner, returned, setSearchParams]);

  async function cancelRenewal() {
    setBusy(true);
    setError(undefined);
    try {
      await cancelFamilyPlan(family);
      setDialog(undefined);
      setNotice("Renewal is canceled. The family stays covered until the paid period ends.");
      await billing.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The renewal could not be canceled.");
    } finally {
      setBusy(false);
    }
  }

  if (!owner) {
    return (
      <section className="family-section" aria-labelledby="family-plan-title">
        <h2 id="family-plan-title">Family plan</h2>
        <p className="family-muted">{memberCopy(detail)}</p>
      </section>
    );
  }

  const current =
    summary?.plan && summary.interval && summary.paidByYou
      ? { plan: summary.plan, interval: summary.interval }
      : null;

  return (
    <>
      {detail.plan === "unpaid" && <JustYouCard familyId={detail.id} onPlanPage />}
      <section className="family-section" aria-labelledby="family-plan-title">
        <h2 id="family-plan-title">Family plan</h2>
        {billing.error ? (
          <p className="page-error" role="alert">
            {billing.error.message}
          </p>
        ) : !summary ? (
          <p className="family-muted">Loading the family plan…</p>
        ) : confirming ? (
          <p className="family-muted" role="status">
            Confirming your payment…
          </p>
        ) : (
          <>
            <p className="family-muted">{ownerCopy(summary)}</p>
            <div className="family-plan-actions">
              {summary.canCheckout && (
                <button
                  ref={openerRef}
                  type="button"
                  className="button primary"
                  onClick={() => setDialog("checkout")}
                >
                  Choose a family plan
                </button>
              )}
              {summary.canChangePlan && current && (
                <button
                  ref={openerRef}
                  type="button"
                  className="button secondary"
                  onClick={() => setDialog("change")}
                >
                  Change plan
                </button>
              )}
              {summary.paidByYou && summary.state === "active" && !summary.cancelAtPeriodEnd && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDialog("cancel")}
                >
                  Cancel renewal
                </button>
              )}
            </div>
          </>
        )}
        {notice && (
          <p className="family-muted" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="page-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {summary && (
        <PlanCheckoutDialog
          open={dialog === "checkout" || dialog === "change"}
          workspace={family}
          plans={familyBillingPlans}
          suggestedPlan={summary.plan === "family_budget" ? "family_pro" : "family_budget"}
          unavailable={checkoutUnavailable(summary)}
          current={dialog === "change" ? current : null}
          returnFocus={openerRef.current}
          onClose={() => setDialog(undefined)}
          onChanged={(response, choice) => {
            setNotice(
              response.outcome === "scheduled"
                ? `The family moves to ${PLAN_NAMES[choice.plan]} when the paid period ends.`
                : `The family is now on ${PLAN_NAMES[choice.plan]}.`,
            );
            void billing.refetch();
          }}
        />
      )}
      {dialog === "cancel" && summary?.currentPeriodEndsAt && (
        <ConfirmDialog
          title="Cancel the family plan renewal?"
          consequence={`The family stays covered until ${formatFamilyDate(summary.currentPeriodEndsAt)}. After that it becomes read only for everyone until you choose a plan again.`}
          confirmLabel="Cancel renewal"
          busy={busy}
          error={error}
          returnFocus={null}
          onConfirm={() => void cancelRenewal()}
          onClose={() => setDialog(undefined)}
        />
      )}
    </>
  );
}

function ownerCopy(summary: FamilyBillingSummary): string {
  if (summary.state === "unpaid") {
    return "No plan yet. The family is yours alone with Free limits, and invitations open once you choose a plan.";
  }
  if (summary.state === "lapsed") {
    return "The family plan has ended, so the family is read only for everyone. Choose a plan to make changes and invite people again.";
  }
  const plan = summary.plan ? PLAN_NAMES[summary.plan] : "A family plan";
  const tier = summary.plan ? TIER_NAMES[PLAN_TIER[summary.plan]] : "paid";
  const until = summary.currentPeriodEndsAt ? formatFamilyDate(summary.currentPeriodEndsAt) : null;
  if (!summary.paidByYou) {
    return `${plan} was paid by the previous owner${until ? ` and ends ${until}` : ""}. Choose a plan to keep the family active after that.`;
  }
  if (summary.pendingChange) {
    return `${plan} covers the family. It moves to ${PLAN_NAMES[summary.pendingChange.plan]} on ${formatFamilyDate(summary.pendingChange.effectiveAt)}.`;
  }
  if (summary.cancelAtPeriodEnd) {
    return `${plan} covers the family${until ? ` until ${until}` : ""}. Renewal is canceled.`;
  }
  return `${plan} covers the family, and everyone in it gets ${tier} for their own Zoption too${until ? `. Renews ${until}` : ""}.`;
}

function memberCopy(detail: FamilyDetail): string {
  if (detail.plan === "lapsed") {
    return "The family plan has ended, so the family is read only until the owner renews it.";
  }
  if (detail.plan === "unpaid") return "The owner has not chosen a family plan yet.";
  return "The family plan covers you. See what it includes in Settings, under Plan and billing.";
}
