import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { AccountRecord, BudgetQuery, SubscriptionUsageList } from "@zoption/shared";

import { markStartupPhase } from "@/diagnostics/startup-timing";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";

import {
  LocalQueryActivity,
  useLocalQuery,
  type LocalQueryOptions,
} from "./local-workspace/use-local-query";
export { LocalQueryActivity };
import type { LocalRemittance, LocalRemittanceOverview } from "./remittance-queries";
import {
  closeLocalWorkspace,
  describeWorkspaceOpenFailure,
  openLocalWorkspace,
  type LocalWorkspace,
} from "./workspace";
import type {
  LocalWorkspaceStats,
  LocalBudgetOccasion,
  LocalBudgetPlanData,
  LocalDashboardData,
  LocalAccountModeling,
  LocalCalendarMonth,
  LocalDebtItem,
  LocalEventItem,
  LocalSubscriptionItem,
  LocalGoalItem,
  LocalReferenceData,
  LocalTransactionItem,
  TransactionFormData,
  TransactionKindFilter,
} from "./view-models";
import type {
  LocalBudgetConflict,
  LocalDebtConflict,
  LocalEventConflict,
  LocalSubscriptionConflict,
  LocalGoalConflict,
  LocalReferenceConflict,
  LocalTransactionConflict,
} from "./transaction-mutation-repository";

export type LocalWorkspaceStatus = "opening" | "ready" | "error";

interface LocalWorkspaceSnapshot {
  status: LocalWorkspaceStatus;
  workspace: LocalWorkspace | null;
  message: string | null;
  retry: () => void;
  reopen: () => void;
}

const LocalWorkspaceContext = createContext<LocalWorkspaceSnapshot | null>(null);

export function LocalWorkspaceProvider({
  subject,
  children,
}: PropsWithChildren<{ subject: string | null }>) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<
    Omit<LocalWorkspaceSnapshot, "retry" | "reopen"> & { subject: string | null }
  >({
    subject: null,
    status: "opening",
    workspace: null,
    message: null,
  });
  const requestRef = useRef(0);
  const readySubjectRef = useRef<string | null>(null);
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const openingSubjectRef = useRef<string | null>(null);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!subject) {
      readySubjectRef.current = null;
      openingSubjectRef.current = null;
      setSnapshot({ subject: null, status: "opening", workspace: null, message: null });
      return;
    }
    // Reopening the file already shown (sync rebuilt it from the server) keeps the last workspace
    // until the new one is open. Going back to "opening" would make the authenticated gate swap
    // every screen for the full-screen loader and remount navigation on Home, dropping the form
    // the user was in. Reads in that short gap trigger a reopen or wait for the new handle.
    if (readySubjectRef.current !== subject) {
      setSnapshot({ subject, status: "opening", workspace: null, message: null });
    }
    openingSubjectRef.current = subject;
    const lease = Symbol("local-workspace");
    void openLocalWorkspace(subject, lease)
      .then((workspace) => {
        if (requestRef.current === requestId) {
          markStartupPhase("workspace:ready");
          readySubjectRef.current = subject;
          openingSubjectRef.current = null;
          setSnapshot({ subject, status: "ready", workspace, message: null });
        }
      })
      .catch((error: unknown) => {
        if (requestRef.current === requestId) {
          readySubjectRef.current = null;
          openingSubjectRef.current = null;
          setSnapshot({
            subject,
            status: "error",
            workspace: null,
            message: describeWorkspaceOpenFailure(error),
          });
        }
      });

    return () => {
      requestRef.current += 1;
      if (openingSubjectRef.current === subject) openingSubjectRef.current = null;
      void closeLocalWorkspace(subject, lease);
    };
  }, [attempt, subject]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const reopen = useCallback(() => {
    if (!subjectRef.current || openingSubjectRef.current === subjectRef.current) return;
    openingSubjectRef.current = subjectRef.current;
    setAttempt((value) => value + 1);
  }, []);
  const value = useMemo(() => {
    // Switching subject (guest -> signed-in, or personal <-> family) hides the previous file on
    // the very render the subject changes so InitialSyncGate never sees a stale workspace.
    if (!subject || snapshot.subject !== subject) {
      return { status: "opening" as const, workspace: null, message: null, retry, reopen };
    }
    return {
      status: snapshot.status,
      workspace: snapshot.workspace,
      message: snapshot.message,
      retry,
      reopen,
    };
  }, [reopen, retry, snapshot, subject]);
  return <LocalWorkspaceContext.Provider value={value}>{children}</LocalWorkspaceContext.Provider>;
}

export function useLocalWorkspace(): LocalWorkspaceSnapshot {
  const value = useContext(LocalWorkspaceContext);
  if (!value) throw new Error("useLocalWorkspace must be used inside LocalWorkspaceProvider.");
  return value;
}

// Every read hook below is a thin wrapper over useWorkspaceQuery -> useLocalQuery, which owns the
// read, the change subscription, closed-handle recovery, and retry. Each keeps its own return
// shape. Readers are memoized because a new reader re-runs the query, and list hooks share NO_ROWS
// so a disabled query holds one stable empty value.
const NO_ROWS: never[] = [];

function useWorkspaceQuery<T>(options: Omit<LocalQueryOptions<T>, "onClosedWorkspace">) {
  const { workspace, reopen } = useLocalWorkspace();
  return useLocalQuery(workspace, { ...options, onClosedWorkspace: reopen });
}

const readStats = (workspace: LocalWorkspace) => workspace.repository.getStats();

function describeStatsFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Local data could not be read.";
}

export function useLocalWorkspaceStats(): {
  stats: LocalWorkspaceStats | null;
  error: string | null;
} {
  const { data, error } = useWorkspaceQuery({
    read: readStats,
    tables: ["accounts", "categories", "transactions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: describeStatsFailure,
  });
  return { stats: data, error };
}

/**
 * Dashboard read. `anchorDate` is the caller's local ISO date: it bounds the
 * transaction window to the widest cashflow view and must match the date the
 * caller passes to `buildDashboardView`, or the chart would read a window the
 * query never loaded.
 */
export function useDashboardData(anchorDate: string): {
  data: LocalDashboardData | null;
  error: string | null;
  retry: () => void;
} {
  // A local day rollover moves the dashboard window, so the reader depends on it.
  const read = useCallback(
    async (current: LocalWorkspace) => {
      const next = await current.repository.getDashboardData(anchorDate);
      markStartupPhase("dashboard:data");
      return next;
    },
    [anchorDate],
  );
  const { data, error, retry } = useWorkspaceQuery({
    read,
    tables: ["accounts", "budgets", "categories", "transactions"],
    empty: null,
    errorMessage: "Dashboard data could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

const readAccountBalances = (workspace: LocalWorkspace) =>
  workspace.repository.getAccountBalances();

/** Accounts with their per-currency balances, without loading the dashboard transaction window. */
export function useAccountBalances(): {
  accounts: AccountRecord[];
  error: string | null;
  retry: () => void;
} {
  const { data, error, retry } = useWorkspaceQuery<AccountRecord[]>({
    read: readAccountBalances,
    tables: ["accounts", "transactions"],
    empty: NO_ROWS,
    errorMessage: "Account balances could not be read from encrypted local storage.",
  });
  return { accounts: data, error, retry };
}

export function useBudgetPlan(period: BudgetQuery): {
  data: LocalBudgetPlanData | null;
  error: string | null;
  retry: () => void;
} {
  const currency = useWorkspaceCurrency();
  // Key the reader on the period's fields: a new object each render would re-run the query.
  const { scope } = period;
  const month = period.scope === "month" ? period.month : null;
  const eventId = period.scope === "occasion" ? period.eventId : null;
  const read = useCallback(
    (current: LocalWorkspace) =>
      current.repository.getBudgetPlan(
        scope === "month" && month
          ? { scope, month }
          : scope === "occasion" && eventId
            ? { scope, eventId }
            : { scope: "every-month" },
        currency,
      ),
    [scope, month, eventId, currency],
  );
  const { data, error, retry } = useWorkspaceQuery({
    read,
    tables: ["budgets", "categories", "transactions", "calendar_events"],
    empty: null,
    errorMessage: "Budgets could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

/** Occasion budgets dated in `month`. */
export function useBudgetOccasions(month: string): {
  occasions: LocalBudgetOccasion[];
  error: string | null;
  retry: () => void;
} {
  const currency = useWorkspaceCurrency();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getBudgetOccasions(month, currency),
    [month, currency],
  );
  const { data, error, retry } = useWorkspaceQuery<LocalBudgetOccasion[]>({
    read,
    tables: ["budgets", "calendar_events", "transactions"],
    empty: NO_ROWS,
    errorMessage: "Occasion budgets could not be read from encrypted local storage.",
  });
  return { occasions: data, error, retry };
}

/** A family's remittance card for `month` (`YYYY-MM-01`) in the workspace currency. */
export function useRemittanceOverview(month: string): {
  overview: LocalRemittanceOverview | null;
  error: string | null;
  retry: () => void;
} {
  const currency = useWorkspaceCurrency();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getRemittanceOverview(month, currency),
    [month, currency],
  );
  const { data, error, retry } = useWorkspaceQuery<LocalRemittanceOverview | null>({
    read,
    tables: ["remittances", "transactions", "accounts"],
    empty: null,
    errorMessage: "Remittances could not be read from encrypted local storage.",
  });
  return { overview: data, error, retry };
}

export function useRemittance(id?: string): {
  remittance: LocalRemittance | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getRemittance(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["remittances", "transactions"],
    empty: null,
    errorMessage: "This remittance could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { remittance: data, loading, error, retry };
}

const readGoals = (workspace: LocalWorkspace) => workspace.repository.getGoals();

export function useGoals(): {
  goals: LocalGoalItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { data, loading, error, retry } = useWorkspaceQuery<LocalGoalItem[]>({
    read: readGoals,
    tables: ["financial_goals", "sync_outbox", "sync_conflicts"],
    empty: NO_ROWS,
    errorMessage: "Goals could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { goals: data, loading, error, retry };
}

export function useGoal(id?: string): {
  goal: LocalGoalItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getGoal(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["financial_goals", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The goal could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { goal: data, loading, error, retry };
}

export function useBudgetConflict(id?: string): {
  conflict: LocalBudgetConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getBudgetConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["budgets", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved budget conflict could not be read from encrypted storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

export function useGoalConflict(id?: string): {
  conflict: LocalGoalConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getGoalConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["financial_goals", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved goal conflict could not be read from encrypted storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

const readDebts = (workspace: LocalWorkspace) => workspace.repository.getDebts();

export function useDebts(): {
  debts: LocalDebtItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { data, loading, error, retry } = useWorkspaceQuery<LocalDebtItem[]>({
    read: readDebts,
    // A payment waiting to sync lowers the shown balance, so a ledger change re-reads it.
    tables: ["debts", "transactions", "sync_outbox", "sync_conflicts"],
    empty: NO_ROWS,
    errorMessage: "Debts could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { debts: data, loading, error, retry };
}

export function useDebt(id?: string): {
  debt: LocalDebtItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getDebt(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["debts", "transactions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The debt could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { debt: data, loading, error, retry };
}

export function useDebtConflict(id?: string): {
  conflict: LocalDebtConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getDebtConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["debts", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved debt conflict could not be read from encrypted storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

const readSubscriptions = (workspace: LocalWorkspace) => workspace.repository.getSubscriptions();

export function useSubscriptions(): {
  subscriptions: LocalSubscriptionItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { data, loading, error, retry } = useWorkspaceQuery<LocalSubscriptionItem[]>({
    read: readSubscriptions,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: NO_ROWS,
    errorMessage: "Bills could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { subscriptions: data, loading, error, retry };
}

const readSubscriptionUsage = (workspace: LocalWorkspace) =>
  workspace.repository.getSubscriptionUsage();
const NO_SUBSCRIPTION_USAGE: SubscriptionUsageList = { usage: [], tracking: [] };

/** Subscription ROI check-ins and Track usage choices, this phone's queued taps included. */
export function useSubscriptionUsage(): { usage: SubscriptionUsageList; error: string | null } {
  const { data, error } = useWorkspaceQuery({
    read: readSubscriptionUsage,
    tables: ["subscription_usage", "subscription_usage_tracking"],
    empty: NO_SUBSCRIPTION_USAGE,
    errorMessage: "Bill check-ins could not be read from encrypted local storage.",
  });
  return { usage: data, error };
}

export function useSubscription(id?: string): {
  subscription: LocalSubscriptionItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getSubscription(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The bill could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { subscription: data, loading, error, retry };
}

export function useSubscriptionConflict(id?: string): {
  conflict: LocalSubscriptionConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      id
        ? (current: LocalWorkspace) => current.transactionMutations.getSubscriptionConflict(id)
        : null,
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved bill conflict could not be read from encrypted storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

export function useCalendarEvents(month: string): {
  events: LocalEventItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getCalendarEvents(month),
    [month],
  );
  const { data, loading, error, retry } = useWorkspaceQuery<LocalEventItem[]>({
    read,
    tables: ["calendar_events", "sync_outbox", "sync_conflicts"],
    empty: NO_ROWS,
    errorMessage: "Calendar events could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { events: data, loading, error, retry };
}

export function useCalendarEvent(id?: string): {
  event: LocalEventItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getCalendarEvent(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["calendar_events", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The calendar event could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { event: data, loading, error, retry };
}

export function useEventConflict(id?: string): {
  conflict: LocalEventConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getEventConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["calendar_events", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved calendar event conflict could not be read from encrypted storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

export function useAccountModeling(id?: string): {
  modeling: LocalAccountModeling | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getAccountModeling(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["accounts", "transactions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The account modeling data could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { modeling: data, loading, error, retry };
}

export function useCalendarMonth(month: string): {
  month: LocalCalendarMonth | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getCalendarMonth(month),
    [month],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["calendar_events", "subscriptions", "transactions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The calendar could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { month: data, loading, error, retry };
}

export function useLocalTransactions(
  search = "",
  kind: TransactionKindFilter = "all",
  month?: string,
): {
  items: LocalTransactionItem[] | null;
  error: string | null;
  retry: () => void;
} {
  const read = useCallback(
    (current: LocalWorkspace) =>
      current.repository.queryTransactions({
        search,
        kind,
        month,
      }),
    [search, kind, month],
  );
  const { data, error, retry } = useWorkspaceQuery({
    read,
    tables: ["accounts", "categories", "transactions"],
    empty: null,
    errorMessage: "Transactions could not be read from encrypted local storage.",
  });
  return { items: data, error, retry };
}

const readReferenceData = (workspace: LocalWorkspace) => workspace.repository.getReferenceData();

export function useLocalReferenceData(): {
  data: LocalReferenceData | null;
  error: string | null;
  retry: () => void;
} {
  const { data, error, retry } = useWorkspaceQuery({
    read: readReferenceData,
    tables: ["accounts", "categories", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "Accounts and categories could not be read from encrypted storage.",
  });
  return { data, error, retry };
}

/** Form options for a new transaction, or for editing `id`; reads even without an id. */
export function useTransactionFormData(id?: string): {
  data: TransactionFormData | null;
  error: string | null;
  retry: () => void;
} {
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getTransactionFormData(id),
    [id],
  );
  const { data, error, retry } = useWorkspaceQuery({
    read,
    tables: ["accounts", "categories", "transactions", "sync_outbox"],
    empty: null,
    errorMessage: "Transaction details could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

/** The device-only picture attached to a transaction, as a data URI, or null. */
export function useTransactionPhoto(id?: string): { photo: string | null } {
  const read = useCallback(
    (current: LocalWorkspace) =>
      id ? current.transactionMutations.getTransactionPhoto(id) : Promise.resolve(null),
    [id],
  );
  const { data } = useWorkspaceQuery({
    read,
    tables: ["transaction_photos"],
    empty: undefined,
    errorMessage: "The transaction photo could not be read from encrypted local storage.",
  });
  return { photo: data ?? null };
}

export function useTransactionConflict(id?: string): {
  conflict: LocalTransactionConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.transactionMutations.getConflict(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: ["transactions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved conflict could not be read from encrypted local storage.",
    initialLoading: Boolean(id),
  });
  return { conflict: data, loading, error, retry };
}

export function useReferenceConflict(
  entityType?: "account" | "category",
  id?: string,
): {
  conflict: LocalReferenceConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const read = useMemo(
    () =>
      entityType && id
        ? (current: LocalWorkspace) =>
            current.transactionMutations.getReferenceConflict(entityType, id)
        : null,
    [entityType, id],
  );
  const { data, loading, error, retry } = useWorkspaceQuery({
    read,
    tables: [entityType === "account" ? "accounts" : "categories", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved conflict could not be read from encrypted local storage.",
    initialLoading: Boolean(entityType && id),
  });
  return { conflict: data, loading, error, retry };
}
