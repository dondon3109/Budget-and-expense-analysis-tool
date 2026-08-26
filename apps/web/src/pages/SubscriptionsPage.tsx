import type {
  SubscriptionInput,
  SubscriptionMonthItem,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatus,
} from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LayoutList, Plus, RefreshCw, Repeat2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import { MetricCard } from "../components/dashboard/MetricCard";
import { AppShell } from "../components/layout/AppShell";
import { InlineLoader } from "../components/layout/InlineLoader";
import { MonthSelector } from "../components/month/MonthSelector";
import { SubscriptionForm } from "../components/subscriptions/SubscriptionForm";
import { SubscriptionRenewalCalendar } from "../components/subscriptions/SubscriptionRenewalCalendar";
import { SubscriptionTable } from "../components/subscriptions/SubscriptionTable";
import {
  createSubscription,
  deleteSubscription,
  getAccounts,
  getCategories,
  getSubscriptions,
  setSubscriptionStatus,
  updateSubscription,
} from "../lib/api";
import { currentMonth } from "../lib/calendar";
import { formatFullMonth, formatMoney } from "../lib/formatters";
import { optimisticId, restoreOptimisticSnapshot, updateOptimistically } from "../lib/optimistic";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./SubscriptionsPage.css";

function subscriptionMonthlyCost(item: Pick<SubscriptionRecord, "amountMinor" | "billingCycle">) {
  return item.billingCycle === "yearly" ? Math.round(item.amountMinor / 12) : item.amountMinor;
}

function updateSubscriptionSummary(
  current: SubscriptionMonthSummary | undefined,
  items: SubscriptionMonthItem[],
): SubscriptionMonthSummary | undefined {
  if (!current) return current;
  return {
    ...current,
    items,
    totalMonthlyCostMinor: items.reduce(
      (total, item) => total + (item.status === "active" ? item.monthlyCostMinor : 0),
      0,
    ),
  };
}

export function SubscriptionsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionRecord | null>(null);
  const monthStart = `${month}-01`;

  const subscriptionsQuery = useQuery({
    queryKey: queryKeys.subscriptions(workspace, monthStart),
    queryFn: () => getSubscriptions(workspace, monthStart),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories(workspace),
    queryFn: () => getCategories(workspace),
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts(workspace),
    queryFn: () => getAccounts(workspace),
  });

  const refreshSubscriptions = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.allSubscriptions(workspace) });

  const createMutation = useMutation({
    mutationFn: (input: SubscriptionInput) => createSubscription(workspace, input),
    onMutate: async (input) => {
      const id = optimisticId("subscription");
      const category = categoriesQuery.data?.find((item) => item.id === input.categoryId);
      const account = accountsQuery.data?.find((item) => item.id === input.accountId);
      const item: SubscriptionMonthItem = {
        ...input,
        id,
        currency: "PHP",
        status: "active",
        categoryName: category?.name ?? "Category",
        categoryColor: category?.color ?? "#64748b",
        accountId: input.accountId,
        accountName: account?.name ?? null,
        billingDate: input.nextBillingDate.startsWith(month) ? input.nextBillingDate : null,
        monthlyCostMinor: subscriptionMonthlyCost(input),
      };
      const snapshot = await updateOptimistically<SubscriptionMonthSummary>(
        queryClient,
        queryKeys.subscriptions(workspace, monthStart),
        (current) => updateSubscriptionSummary(current, [item, ...(current?.items ?? [])]),
      );
      setFormOpen(false);
      setEditing(null);
      return { id, item, snapshot };
    },
    onError: (_error, _input, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
      setEditing(context?.item ?? null);
      setFormOpen(true);
    },
    onSuccess: (saved, _input, context) => {
      queryClient.setQueryData<SubscriptionMonthSummary>(
        queryKeys.subscriptions(workspace, monthStart),
        (current) =>
          updateSubscriptionSummary(
            current,
            (current?.items ?? []).map((item) =>
              item.id === context.id
                ? {
                    ...item,
                    ...saved,
                    monthlyCostMinor: subscriptionMonthlyCost(saved),
                  }
                : item,
            ),
          ),
      );
    },
    onSettled: () => {
      void refreshSubscriptions();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (args: { id: string; status: SubscriptionStatus }) =>
      setSubscriptionStatus(workspace, { id: args.id, input: { status: args.status } }),
    onMutate: async ({ id, status }) => ({
      snapshot: await updateOptimistically<SubscriptionMonthSummary>(
        queryClient,
        queryKeys.subscriptions(workspace, monthStart),
        (current) =>
          updateSubscriptionSummary(
            current,
            (current?.items ?? []).map((item) => (item.id === id ? { ...item, status } : item)),
          ),
      ),
    }),
    onError: (_error, _args, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSettled: () => {
      void refreshSubscriptions();
    },
  });
  const updateMutation = useMutation({
    mutationFn: (args: { id: string; input: SubscriptionInput }) =>
      updateSubscription(workspace, { id: args.id, input: args.input }),
    onMutate: async ({ id, input }) => {
      const form = editing;
      const category = categoriesQuery.data?.find((item) => item.id === input.categoryId);
      const account = accountsQuery.data?.find((item) => item.id === input.accountId);
      const snapshot = await updateOptimistically<SubscriptionMonthSummary>(
        queryClient,
        queryKeys.subscriptions(workspace, monthStart),
        (current) =>
          updateSubscriptionSummary(
            current,
            (current?.items ?? []).map((item) =>
              item.id === id
                ? {
                    ...item,
                    ...input,
                    categoryName: category?.name ?? item.categoryName,
                    categoryColor: category?.color ?? item.categoryColor,
                    accountName: account?.name ?? item.accountName,
                    monthlyCostMinor: subscriptionMonthlyCost(input),
                  }
                : item,
            ),
          ),
      );
      setFormOpen(false);
      setEditing(null);
      return { form, snapshot };
    },
    onError: (_error, _args, context) => {
      restoreOptimisticSnapshot(queryClient, context?.snapshot);
      setEditing(context?.form ?? null);
      setFormOpen(true);
    },
    onSettled: () => {
      void refreshSubscriptions();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubscription(workspace, id),
    onMutate: async (id) => ({
      snapshot: await updateOptimistically<SubscriptionMonthSummary>(
        queryClient,
        queryKeys.subscriptions(workspace, monthStart),
        (current) =>
          updateSubscriptionSummary(
            current,
            (current?.items ?? []).filter((item) => item.id !== id),
          ),
      ),
    }),
    onError: (_error, _id, context) => restoreOptimisticSnapshot(queryClient, context?.snapshot),
    onSettled: () => {
      void refreshSubscriptions();
    },
  });

  const formInitial = editing ?? undefined;
  const formBusy = createMutation.isPending || updateMutation.isPending;
  const formError = createMutation.error?.message ?? updateMutation.error?.message;

  const data = subscriptionsQuery.data;
  const categories = categoriesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  function openForm() {
    createMutation.reset();
    updateMutation.reset();
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: SubscriptionRecord) {
    createMutation.reset();
    updateMutation.reset();
    setEditing(item);
    setFormOpen(true);
  }

  function confirmDelete(item: SubscriptionRecord) {
    if (window.confirm(`Delete “${item.name}”? This cannot be undone.`)) {
      deleteMutation.mutate(item.id);
    }
  }

  return (
    <AppShell>
      <div className="dashboard-page subscriptions-page">
        <header className="dashboard-header transaction-header">
          <div>
            <p className="eyebrow">Recurring costs</p>
            <h1>Monthly subscriptions</h1>
            <p>Track recurring charges and see what they add up to.</p>
          </div>
          <div className="header-actions subscriptions-header-actions">
            <MonthSelector label="Subscription month" value={month} onChange={setMonth} />
            <button className="button primary" type="button" onClick={openForm}>
              <Plus size={17} aria-hidden="true" /> Add a subscription
            </button>
          </div>
        </header>

        {subscriptionsQuery.isPending && <InlineLoader label="Loading your subscriptions" />}
        {subscriptionsQuery.isError && (
          <div className="table-status error" role="alert">
            <strong>Subscriptions could not be loaded.</strong>
            <span>{subscriptionsQuery.error.message}</span>
            <button type="button" onClick={() => void subscriptionsQuery.refetch()}>
              Try again
            </button>
          </div>
        )}

        {data && (
          <>
            <section
              className="subscription-summary"
              aria-label={`${formatFullMonth(month)} subscription summary`}
            >
              <MetricCard
                label="Total monthly cost"
                value={formatMoney(data.totalMonthlyCostMinor)}
                detail={`${formatFullMonth(month)} · Active plans only · Yearly plans divided across 12 months`}
                icon={Repeat2}
                tone="sage"
              />
            </section>

            <section className="transactions-panel subscriptions-panel" aria-live="polite">
              <div className="transactions-panel-heading">
                <div>
                  <strong>
                    {data.items.length} subscription{data.items.length === 1 ? "" : "s"}
                  </strong>
                  <span>{formatFullMonth(month)} · Philippine pesos</span>
                </div>
                <div className="subscriptions-panel-actions">
                  <div
                    className="subscriptions-view-toggle"
                    role="group"
                    aria-label="Subscriptions view"
                  >
                    <button
                      className={`view-toggle-button ${viewMode === "table" ? "active" : ""}`}
                      type="button"
                      onClick={() => setViewMode("table")}
                      aria-pressed={viewMode === "table"}
                      title="Table view"
                    >
                      <LayoutList size={14} aria-hidden="true" />
                      <span>Table</span>
                    </button>
                    <button
                      className={`view-toggle-button ${viewMode === "calendar" ? "active" : ""}`}
                      type="button"
                      onClick={() => setViewMode("calendar")}
                      aria-pressed={viewMode === "calendar"}
                      title="Visual Renewal Calendar"
                    >
                      <CalendarDays size={14} aria-hidden="true" />
                      <span>Renewal calendar</span>
                    </button>
                  </div>
                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => void subscriptionsQuery.refetch()}
                    disabled={subscriptionsQuery.isFetching}
                  >
                    <RefreshCw
                      size={15}
                      className={subscriptionsQuery.isFetching ? "spinning" : ""}
                    />{" "}
                    Refresh
                  </button>
                </div>
              </div>

              {data.items.length === 0 ? (
                <div className="empty-transactions subscriptions-empty">
                  <p className="eyebrow">A clean starting point</p>
                  <strong>Start with your recurring charges</strong>
                  <p>
                    Add the services and memberships you pay for, and Zoption will show their
                    monthly cost in one place.
                  </p>
                  <button className="button primary" type="button" onClick={openForm}>
                    <Plus size={16} aria-hidden="true" /> Add a subscription
                  </button>
                </div>
              ) : viewMode === "calendar" ? (
                <SubscriptionRenewalCalendar month={month} items={data.items} onEdit={openEdit} />
              ) : (
                <SubscriptionTable
                  items={data.items}
                  updatingId={statusMutation.variables?.id}
                  deletingId={deleteMutation.variables}
                  onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                />
              )}
            </section>
          </>
        )}

        {(createMutation.isError ||
          updateMutation.isError ||
          deleteMutation.isError ||
          statusMutation.isError ||
          categoriesQuery.isError ||
          accountsQuery.isError) && (
          <p className="page-error" role="alert">
            {createMutation.error?.message ??
              updateMutation.error?.message ??
              deleteMutation.error?.message ??
              statusMutation.error?.message ??
              categoriesQuery.error?.message ??
              accountsQuery.error?.message}
          </p>
        )}
      </div>

      {formOpen && (
        <SubscriptionForm
          categories={categories}
          accounts={accounts}
          initial={formInitial}
          busy={formBusy}
          serverError={formError}
          onSubmit={async (input) => {
            if (editing && !editing.id.startsWith("optimistic:")) {
              await updateMutation.mutateAsync({ id: editing.id, input });
            } else {
              await createMutation.mutateAsync(input);
            }
          }}
          onClose={() => {
            if (!formBusy) {
              setFormOpen(false);
              setEditing(null);
            }
          }}
        />
      )}
    </AppShell>
  );
}
