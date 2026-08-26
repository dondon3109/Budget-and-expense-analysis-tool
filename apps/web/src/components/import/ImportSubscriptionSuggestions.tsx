import {
  detectImportSubscriptionCandidates,
  type ImportPreview,
  type ImportSubscriptionCandidate,
} from "@zoption/shared";
import type {
  AccountRecord,
  CategoryRecord,
  SubscriptionInput,
  SubscriptionMonthItem,
  SubscriptionRecord,
} from "@zoption/shared";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Repeat2, Sparkles, Tag, X } from "lucide-react";

import { SubscriptionForm } from "../subscriptions/SubscriptionForm";
import { createSubscription } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import "./ImportSubscriptionSuggestions.css";

interface ImportSubscriptionSuggestionsProps {
  preview: ImportPreview | undefined;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  workspace: AuthenticatedWorkspace;
  existingSubscriptions?: SubscriptionMonthItem[];
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function ImportSubscriptionSuggestions({
  preview,
  categories,
  accounts,
  workspace,
  existingSubscriptions,
}: ImportSubscriptionSuggestionsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeCandidate, setActiveCandidate] = useState<ImportSubscriptionCandidate | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const candidates = useMemo(() => {
    if (!preview) return [];
    return detectImportSubscriptionCandidates(preview.rows);
  }, [preview]);

  const existingNames = useMemo(() => {
    const set = new Set<string>();
    for (const sub of existingSubscriptions ?? []) {
      set.add(normalizedName(sub.name));
    }
    return set;
  }, [existingSubscriptions]);

  const visible = useMemo(() => {
    return candidates.filter(
      (c) => !dismissed.has(c.normalized) && !existingNames.has(c.normalized),
    );
  }, [candidates, dismissed, existingNames]);

  const selectableCategories = useMemo(
    () => categories.filter((c) => !c.archived && c.kind === "expense" && !c.locked),
    [categories],
  );
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  const createMutation = useMutation({
    mutationFn: (input: SubscriptionInput) => createSubscription(workspace, input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allSubscriptions(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions(workspace, new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-01") });
      if (activeCandidate) {
        setDismissed((prev) => new Set([...prev, activeCandidate.normalized]));
        setSuccessMessage('"' + created.name + '" is now tracked as an active subscription. See it in your Renewal Calendar.');
        setActiveCandidate(null);
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    },
  });

  if (!preview || visible.length === 0) {
    return successMessage ? (
      <div className="import-subscription-success" role="status">
        <Sparkles size={18} aria-hidden="true" />
        <span>{successMessage}</span>
      </div>
    ) : null;
  }

  function resolveCategoryId(candidate: ImportSubscriptionCandidate): string {
    const byId = candidate.categoryId
      ? categories.find((c) => c.id === candidate.categoryId && !c.archived && c.kind === "expense" && !c.locked)
      : undefined;
    if (byId) return byId.id;
    const byName = categories.find(
      (c) => normalizedName(c.name) === normalizedName(candidate.categoryName) && !c.archived && c.kind === "expense" && !c.locked,
    );
    if (byName) return byName.id;
    return selectableCategories[0]?.id ?? "";
  }

  function resolveAccountId(): string {
    return activeAccounts[0]?.id ?? "";
  }

  const formInitial = activeCandidate
    ? ({
        id: "new-subscription",
        name: activeCandidate.description,
        amountMinor: activeCandidate.typicalAmountMinor,
        currency: "PHP" as const,
        billingCycle: activeCandidate.billingCycle,
        nextBillingDate: activeCandidate.nextBillingDate,
        status: "active" as const,
        categoryId: resolveCategoryId(activeCandidate),
        categoryName: activeCandidate.categoryName,
        categoryColor: selectableCategories.find((c) => c.id === resolveCategoryId(activeCandidate))?.color ?? "#64748b",
        accountId: resolveAccountId(),
        accountName: activeAccounts.find((a) => a.id === resolveAccountId())?.name ?? null,
      } satisfies SubscriptionRecord)
    : undefined;

  return (
    <>
      <section
        className="import-subscription-suggestions"
        aria-label="Recurring charges detected in this import"
      >
        <header className="suggestion-header">
          <div className="suggestion-header-icon">
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div className="suggestion-header-text">
            <strong>
              <Repeat2 size={14} aria-hidden="true" /> {visible.length} recurring{" "}
              {visible.length === 1 ? "charge" : "charges"} detected
            </strong>
            <span>
              We found repeating merchants, amounts, and billing cycles in this file. Track them as
              active subscriptions to see billing dates, next charges, and combined commitments in
              your{" "}
              <span className="suggestion-renewal-link">
                <CalendarDays size={12} aria-hidden="true" /> Renewal Calendar
              </span>
              .
            </span>
          </div>
          <button
            type="button"
            className="suggestion-dismiss-all"
            aria-label="Dismiss all suggestions"
            onClick={() => setDismissed(new Set(candidates.map((c) => c.normalized)))}
            title="Dismiss all"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <ul className="suggestion-list">
          {visible.map((candidate) => {
            const amountVariation = candidate.lowestAmountMinor !== candidate.highestAmountMinor;
            return (
              <li key={candidate.normalized} className="suggestion-item">
                <div className="suggestion-item-main">
                  <div className="suggestion-item-header">
                    <strong className="suggestion-merchant">{candidate.description}</strong>
                    <span
                      className={"suggestion-cadence " + candidate.cadence}
                      title={"Billing cadence: " + candidate.cadence}
                    >
                      {candidate.billingCycle === "yearly" ? "Yearly billing" : "Monthly billing"}
                      {candidate.cadence === "irregular" ? " · estimated" : ""}
                    </span>
                    <span className={"suggestion-confidence " + candidate.confidence}>
                      {candidate.confidence === "high" ? "High confidence" : "Medium confidence"}
                    </span>
                  </div>

                  <div className="suggestion-meta">
                    <span className="suggestion-amount">{formatMoney(candidate.typicalAmountMinor)}</span>
                    <span className="suggestion-dot">·</span>
                    <span className="suggestion-count">
                      {candidate.occurrenceCount} times in {candidate.distinctMonths}{" "}
                      {candidate.distinctMonths === 1 ? "month" : "months"}
                    </span>
                    <span className="suggestion-dot">·</span>
                    <span className="suggestion-category">
                      <Tag size={12} aria-hidden="true" /> {candidate.categoryName}
                    </span>
                  </div>

                  <div className="suggestion-dates">
                    <CalendarDays size={12} aria-hidden="true" />
                    <span>
                      {candidate.occurrenceDates.slice(0, 4).join(" · ")}
                      {candidate.occurrenceDates.length > 4
                        ? " · +" + (candidate.occurrenceDates.length - 4) + " more"
                        : ""}
                      {" "}· Next: {candidate.nextBillingDate}
                    </span>
                  </div>

                  {amountVariation && (
                    <div className="suggestion-variation">
                      Range {formatMoney(candidate.lowestAmountMinor)} –{" "}
                      {formatMoney(candidate.highestAmountMinor)}
                      {candidate.priceChangePercent !== null && candidate.priceChangePercent !== 0
                        ? " · " + (candidate.priceChangePercent > 0 ? "+" : "") + candidate.priceChangePercent + "% since last"
                        : ""}
                    </div>
                  )}
                </div>

                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="button primary compact"
                    onClick={() => setActiveCandidate(candidate)}
                    disabled={!resolveCategoryId(candidate) || !resolveAccountId()}
                    title={
                      !resolveCategoryId(candidate) || !resolveAccountId()
                        ? "Create an account and expense category first"
                        : "Track as subscription"
                    }
                  >
                    <Plus size={14} aria-hidden="true" /> Track as subscription
                  </button>
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={() => setDismissed((prev) => new Set([...prev, candidate.normalized]))}
                    aria-label={"Dismiss " + candidate.description}
                  >
                    Not now
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="suggestion-footer">
          Tracking creates an active subscription and a matching expense on its next billing date. You
          can edit the amount, billing cycle, or billing date before saving. Yearly plans are divided
          across 12 months in your Renewal Calendar cash-flow totals.
        </p>
      </section>

      {successMessage && (
        <div className="import-subscription-success" role="status">
          <Sparkles size={18} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {activeCandidate && formInitial && (
        <SubscriptionForm
          categories={categories}
          accounts={accounts}
          initial={formInitial}
          busy={createMutation.isPending}
          serverError={createMutation.error?.message}
          title="Add subscription"
          submitLabel="Add subscription"
          onSubmit={async (input) => {
            await createMutation.mutateAsync(input);
          }}
          onClose={() => {
            if (!createMutation.isPending) {
              setActiveCandidate(null);
              createMutation.reset();
            }
          }}
        />
      )}
    </>
  );
}
