import type { SubscriptionInput, SubscriptionRecord, SubscriptionStatus } from "@zoption/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthProvider";
import { MetricCard } from "../components/dashboard/MetricCard";
import { AppShell } from "../components/layout/AppShell";
import { InlineLoader } from "../components/layout/InlineLoader";
import { MonthSelector } from "../components/month/MonthSelector";
import { SubscriptionForm } from "../components/subscriptions/SubscriptionForm";
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
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import "./SubscriptionsPage.css";

export function SubscriptionsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
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
    onSuccess: async () => {
      setFormOpen(false);
      await refreshSubscriptions();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (args: { id: string; status: SubscriptionStatus }) =>
      setSubscriptionStatus(workspace, { id: args.id, input: { status: args.status } }),
    onSuccess: refreshSubscriptions,
  });
  const updateMutation = useMutation({
    mutationFn: (args: { id: string; input: SubscriptionInput }) =>
      updateSubscription(workspace, { id: args.id, input: args.input }),
    onSuccess: async () => {
      setFormOpen(false);
      setEditing(null);
      await refreshSubscriptions();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubscription(workspace, id),
    onSuccess: refreshSubscriptions,
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
            if (editing) {
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
