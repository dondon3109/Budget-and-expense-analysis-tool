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

import { markStartupPhase } from "@/diagnostics/startup-timing";

import { useLocalQuery } from "./local-workspace/use-local-query";
import {
  closeLocalWorkspace,
  describeWorkspaceOpenFailure,
  openLocalWorkspace,
  type LocalWorkspace,
} from "./workspace";
import type {
  LocalWorkspaceStats,
  LocalBudgetMonthData,
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
}: PropsWithChildren<{ subject: string }>) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<LocalWorkspaceSnapshot, "retry" | "reopen">>({
    status: "opening",
    workspace: null,
    message: null,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSnapshot({ status: "opening", workspace: null, message: null });
    void openLocalWorkspace(subject)
      .then((workspace) => {
        if (requestRef.current === requestId) {
          markStartupPhase("workspace:ready");
          setSnapshot({ status: "ready", workspace, message: null });
        }
      })
      .catch((error: unknown) => {
        if (requestRef.current === requestId) {
          setSnapshot({
            status: "error",
            workspace: null,
            message: describeWorkspaceOpenFailure(error),
          });
        }
      });

    return () => {
      requestRef.current += 1;
      void closeLocalWorkspace(subject);
    };
  }, [attempt, subject]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const reopen = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...snapshot, retry, reopen }), [reopen, retry, snapshot]);
  return <LocalWorkspaceContext.Provider value={value}>{children}</LocalWorkspaceContext.Provider>;
}

export function useLocalWorkspace(): LocalWorkspaceSnapshot {
  const value = useContext(LocalWorkspaceContext);
  if (!value) throw new Error("useLocalWorkspace must be used inside LocalWorkspaceProvider.");
  return value;
}

// Every read hook below is a thin wrapper over useLocalQuery, which owns the read, the change
// subscription, and retry. Each keeps its own return shape. Readers are memoized because a new
// reader re-runs the query, and list hooks share NO_ROWS so a disabled query holds one stable
// empty value.
const NO_ROWS: never[] = [];

const readStats = (workspace: LocalWorkspace) => workspace.repository.getStats();

function describeStatsFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Local data could not be read.";
}

export function useLocalWorkspaceStats(): {
  stats: LocalWorkspaceStats | null;
  error: string | null;
} {
  const { workspace } = useLocalWorkspace();
  const { data, error } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  // A local day rollover moves the dashboard window, so the reader depends on it.
  const read = useCallback(
    async (current: LocalWorkspace) => {
      const next = await current.repository.getDashboardData(anchorDate);
      markStartupPhase("dashboard:data");
      return next;
    },
    [anchorDate],
  );
  const { data, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["accounts", "categories", "transactions"],
    empty: null,
    errorMessage: "Dashboard data could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

export function useBudgetMonth(month: string): {
  data: LocalBudgetMonthData | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getBudgetMonth(month),
    [month],
  );
  const { data, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["budgets", "categories", "transactions"],
    empty: null,
    errorMessage: "Budgets could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

const readGoals = (workspace: LocalWorkspace) => workspace.repository.getGoals();

export function useGoals(): {
  goals: LocalGoalItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const { data, loading, error, retry } = useLocalQuery<LocalGoalItem[]>(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getGoal(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getBudgetConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getGoalConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const { data, loading, error, retry } = useLocalQuery<LocalDebtItem[]>(workspace, {
    read: readDebts,
    tables: ["debts", "sync_outbox", "sync_conflicts"],
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getDebt(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["debts", "sync_outbox", "sync_conflicts"],
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getDebtConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const { data, loading, error, retry } = useLocalQuery<LocalSubscriptionItem[]>(workspace, {
    read: readSubscriptions,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: NO_ROWS,
    errorMessage: "Subscriptions could not be read from encrypted local storage.",
    initialLoading: true,
  });
  return { subscriptions: data, loading, error, retry };
}

export function useSubscription(id?: string): {
  subscription: LocalSubscriptionItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getSubscription(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The subscription could not be read from encrypted local storage.",
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      id
        ? (current: LocalWorkspace) => current.transactionMutations.getSubscriptionConflict(id)
        : null,
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["subscriptions", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved subscription conflict could not be read from encrypted storage.",
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
  const { workspace } = useLocalWorkspace();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getCalendarEvents(month),
    [month],
  );
  const { data, loading, error, retry } = useLocalQuery<LocalEventItem[]>(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getCalendarEvent(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      id ? (current: LocalWorkspace) => current.transactionMutations.getEventConflict(id) : null,
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.repository.getAccountModeling(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getCalendarMonth(month),
    [month],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useCallback(
    (current: LocalWorkspace) =>
      current.repository.queryTransactions({
        search,
        kind,
        month,
        limit: month ? 200 : undefined,
      }),
    [search, kind, month],
  );
  const { data, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const { data, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useCallback(
    (current: LocalWorkspace) => current.repository.getTransactionFormData(id),
    [id],
  );
  const { data, error, retry } = useLocalQuery(workspace, {
    read,
    tables: ["accounts", "categories", "transactions", "sync_outbox"],
    empty: null,
    errorMessage: "Transaction details could not be read from encrypted local storage.",
  });
  return { data, error, retry };
}

export function useTransactionConflict(id?: string): {
  conflict: LocalTransactionConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () => (id ? (current: LocalWorkspace) => current.transactionMutations.getConflict(id) : null),
    [id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
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
  const { workspace } = useLocalWorkspace();
  const read = useMemo(
    () =>
      entityType && id
        ? (current: LocalWorkspace) =>
            current.transactionMutations.getReferenceConflict(entityType, id)
        : null,
    [entityType, id],
  );
  const { data, loading, error, retry } = useLocalQuery(workspace, {
    read,
    tables: [entityType === "account" ? "accounts" : "categories", "sync_outbox", "sync_conflicts"],
    empty: null,
    errorMessage: "The preserved conflict could not be read from encrypted local storage.",
    initialLoading: Boolean(entityType && id),
  });
  return { conflict: data, loading, error, retry };
}
