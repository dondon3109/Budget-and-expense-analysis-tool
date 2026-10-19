import {
  familyBillingPlans,
  PLAN_NAMES,
  PLAN_TIER,
  TIER_NAMES,
  type FamilyBillingSummary,
  type FamilyDetail,
} from "@zoption/shared";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { cancelFamilyPlan, getFamilyBillingSummary } from "@/api/billing";
import { PlanPicker } from "@/features/billing/PlanPicker";
import { usePlanCheckout } from "@/features/billing/use-plan-checkout";
import { Button, Card, ConfirmationDialog, Skeleton } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

import { SectionLabel } from "./family-ui";
import { JustYouCard } from "./JustYouCard";
import { formatFamilyDate, useFamilyApi } from "./use-family-api";

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
  return "The family plan covers you. See what it includes in More, under Plan and billing.";
}

/**
 * The family's plan in Family settings. The owner buys, changes, and cancels it here; everyone
 * else sees what it gives them. `onChanged` reloads the family, whose plan opens invitations.
 * Needs a connection.
 */
export function FamilyPlanSection({
  detail,
  onChanged,
}: {
  detail: FamilyDetail;
  onChanged: () => void;
}) {
  const theme = useZoptionTheme();
  const familyApi = useFamilyApi();
  const owner = detail.role === "owner";
  const [summary, setSummary] = useState<FamilyBillingSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const load = useCallback(async () => {
    if (!familyApi || !owner) return;
    setFailed(null);
    try {
      setSummary(await familyApi(getFamilyBillingSummary));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The family plan could not be loaded.");
    }
  }, [familyApi, owner]);
  useEffect(() => {
    void load();
  }, [load]);

  const settled = useCallback(() => {
    setPicking(false);
    void load();
    onChanged();
  }, [load, onChanged]);
  const { busy, setBusy, message, setMessage, checkout, change, checkPayment } = usePlanCheckout(
    detail.id,
    settled,
  );

  const muted = { color: theme.colors.textMuted };

  if (!owner) {
    return (
      <View style={{ gap: spacing.xs }}>
        <SectionLabel>Family plan</SectionLabel>
        <Card>
          <Text style={[typography.body, muted]}>{memberCopy(detail)}</Text>
        </Card>
      </View>
    );
  }

  const cancelRenewal = async () => {
    if (!familyApi) return;
    setConfirmingCancel(false);
    setBusy("cancel");
    setMessage(null);
    try {
      await familyApi(cancelFamilyPlan);
      setMessage("Renewal is canceled. The family stays covered until the paid period ends.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The renewal could not be canceled.");
    } finally {
      setBusy(null);
    }
  };

  const current =
    summary?.plan && summary.interval && summary.paidByYou
      ? { plan: summary.plan, interval: summary.interval }
      : null;
  const changing = summary?.canChangePlan === true && current !== null;

  return (
    <View style={{ gap: spacing.xs }}>
      {detail.plan === "unpaid" ? <JustYouCard familyId={detail.id} onPlanPage /> : null}
      <SectionLabel>Family plan</SectionLabel>
      <Card style={{ gap: spacing.sm }}>
        {failed ? (
          <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.danger }]}>
            {failed}
          </Text>
        ) : !summary ? (
          <Skeleton height={48} />
        ) : (
          <>
            <Text style={[typography.body, muted]}>{ownerCopy(summary)}</Text>
            {summary.pendingCheckout ? (
              <Button
                loading={busy === "reconcile"}
                onPress={() => void checkPayment()}
                variant="secondary"
              >
                Check payment status
              </Button>
            ) : null}
            {picking ? (
              <PlanPicker
                busy={busy}
                current={changing ? current : null}
                onChange={(choice) => void change(choice)}
                onCheckout={(choice, provider) => void checkout(choice, provider)}
                plans={familyBillingPlans}
                suggestedPlan={summary.plan === "family_budget" ? "family_pro" : "family_budget"}
              />
            ) : summary.canCheckout || changing ? (
              <Button onPress={() => setPicking(true)}>
                {changing ? "Change plan" : "Choose a family plan"}
              </Button>
            ) : null}
            {summary.paidByYou && summary.state === "active" && !summary.cancelAtPeriodEnd ? (
              <Button
                disabled={busy !== null}
                loading={busy === "cancel"}
                onPress={() => setConfirmingCancel(true)}
                variant="secondary"
              >
                Cancel renewal
              </Button>
            ) : null}
          </>
        )}
        {message ? (
          <Text accessibilityRole="alert" style={[typography.callout, muted]}>
            {message}
          </Text>
        ) : null}
      </Card>
      <ConfirmationDialog
        confirmLabel="Cancel renewal"
        destructive
        message={`The family stays covered until ${summary?.currentPeriodEndsAt ? formatFamilyDate(summary.currentPeriodEndsAt) : "the paid period ends"}. After that it becomes read only for everyone until you choose a plan again.`}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={() => void cancelRenewal()}
        title="Cancel the family plan renewal?"
        visible={confirmingCancel}
      />
    </View>
  );
}
