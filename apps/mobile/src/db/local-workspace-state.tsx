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
import { addDatabaseChangeListener } from "expo-sqlite";

import { closeLocalWorkspace, describeWorkspaceOpenFailure, openLocalWorkspace, type LocalWorkspace } from "./workspace";
import type { LocalWorkspaceStats } from "./repository";
import type {
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
} from "./repository";
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

export function useLocalWorkspaceStats(): {
  stats: LocalWorkspaceStats | null;
  error: string | null;
} {
  const { workspace } = useLocalWorkspace();
  const [stats, setStats] = useState<LocalWorkspaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setStats(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .getStats()
        .then((next) => {
          if (active) {
            setStats(next);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : "Local data could not be read.");
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "categories", "transactions", "sync_outbox", "sync_conflicts"].includes(
          event.tableName,
        )
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [workspace]);

  return { stats, error };
}

export function useDashboardData(): {
  data: LocalDashboardData | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LocalDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .getDashboardData()
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError("Dashboard data could not be read from encrypted local storage.");
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "categories", "transactions"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, retry };
}

export function useBudgetMonth(month: string): {
  data: LocalBudgetMonthData | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LocalBudgetMonthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .getBudgetMonth(month)
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError("Budgets could not be read from encrypted local storage.");
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["budgets", "categories", "transactions"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, month, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, retry };
}

export function useGoals(): {
  goals: LocalGoalItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [goals, setGoals] = useState<LocalGoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setGoals([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getGoals()
        .then((next) => {
          if (active) {
            setGoals(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("Goals could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["financial_goals", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { goals, loading, error, retry };
}

export function useGoal(id?: string): {
  goal: LocalGoalItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [goal, setGoal] = useState<LocalGoalItem | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setGoal(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getGoal(id)
        .then((next) => {
          if (active) {
            setGoal(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The goal could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["financial_goals", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { goal, loading, error, retry };
}

export function useBudgetConflict(id?: string): {
  conflict: LocalBudgetConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalBudgetConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getBudgetConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The preserved budget conflict could not be read from encrypted storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["budgets", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}

export function useGoalConflict(id?: string): {
  conflict: LocalGoalConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalGoalConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getGoalConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The preserved goal conflict could not be read from encrypted storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["financial_goals", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}

export function useDebts(): {
  debts: LocalDebtItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [debts, setDebts] = useState<LocalDebtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setDebts([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getDebts()
        .then((next) => {
          if (active) {
            setDebts(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("Debts could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["debts", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { debts, loading, error, retry };
}

export function useDebt(id?: string): {
  debt: LocalDebtItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [debt, setDebt] = useState<LocalDebtItem | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setDebt(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getDebt(id)
        .then((next) => {
          if (active) {
            setDebt(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The debt could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["debts", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { debt, loading, error, retry };
}

export function useDebtConflict(id?: string): {
  conflict: LocalDebtConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalDebtConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getDebtConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The preserved debt conflict could not be read from encrypted storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["debts", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}

export function useSubscriptions(): {
  subscriptions: LocalSubscriptionItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [subscriptions, setSubscriptions] = useState<LocalSubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setSubscriptions([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getSubscriptions()
        .then((next) => {
          if (active) {
            setSubscriptions(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("Subscriptions could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["subscriptions", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { subscriptions, loading, error, retry };
}

export function useSubscription(id?: string): {
  subscription: LocalSubscriptionItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [subscription, setSubscription] = useState<LocalSubscriptionItem | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setSubscription(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getSubscription(id)
        .then((next) => {
          if (active) {
            setSubscription(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The subscription could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["subscriptions", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { subscription, loading, error, retry };
}

export function useSubscriptionConflict(id?: string): {
  conflict: LocalSubscriptionConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalSubscriptionConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getSubscriptionConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(
              "The preserved subscription conflict could not be read from encrypted storage.",
            );
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["subscriptions", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}

export function useCalendarEvents(month: string): {
  events: LocalEventItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [events, setEvents] = useState<LocalEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getCalendarEvents(month)
        .then((next) => {
          if (active) {
            setEvents(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("Calendar events could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["calendar_events", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, month, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { events, loading, error, retry };
}

export function useCalendarEvent(id?: string): {
  event: LocalEventItem | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [event, setEvent] = useState<LocalEventItem | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setEvent(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getCalendarEvent(id)
        .then((next) => {
          if (active) {
            setEvent(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The calendar event could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["calendar_events", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { event, loading, error, retry };
}

export function useEventConflict(id?: string): {
  conflict: LocalEventConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalEventConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getEventConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(
              "The preserved calendar event conflict could not be read from encrypted storage.",
            );
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["calendar_events", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}

export function useAccountModeling(id?: string): {
  modeling: LocalAccountModeling | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [modeling, setModeling] = useState<LocalAccountModeling | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setModeling(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getAccountModeling(id)
        .then((next) => {
          if (active) {
            setModeling(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The account modeling data could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "transactions", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { modeling, loading, error, retry };
}

export function useCalendarMonth(month: string): {
  month: LocalCalendarMonth | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LocalCalendarMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.repository
        .getCalendarMonth(month)
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The calendar could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const listener = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        [
          "calendar_events",
          "subscriptions",
          "transactions",
          "sync_outbox",
          "sync_conflicts",
        ].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [attempt, month, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { month: data, loading, error, retry };
}

export function useLocalTransactions(
  search = "",
  kind: TransactionKindFilter = "all",
): {
  items: LocalTransactionItem[] | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<LocalTransactionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setItems(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .queryTransactions({ search, kind })
        .then((next) => {
          if (active) {
            setItems(next);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError("Transactions could not be read from encrypted local storage.");
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "categories", "transactions"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, workspace, search, kind]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { items, error, retry };
}

export function useLocalReferenceData(): {
  data: LocalReferenceData | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LocalReferenceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .getReferenceData()
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError("Accounts and categories could not be read from encrypted storage.");
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "categories", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, retry };
}

export function useTransactionFormData(id?: string): {
  data: TransactionFormData | null;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TransactionFormData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) {
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      void workspace.repository
        .getTransactionFormData(id)
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
          }
        })
        .catch(() => {
          if (active) {
            setError("Transaction details could not be read from encrypted local storage.");
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["accounts", "categories", "transactions", "sync_outbox"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, retry };
}

export function useTransactionConflict(id?: string): {
  conflict: LocalTransactionConflict | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { workspace } = useLocalWorkspace();
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalTransactionConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getConflict(id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The preserved conflict could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        ["transactions", "sync_outbox", "sync_conflicts"].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
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
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState<LocalReferenceConflict | null>(null);
  const [loading, setLoading] = useState(Boolean(entityType && id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !entityType || !id) {
      setConflict(null);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      setLoading(true);
      void workspace.transactionMutations
        .getReferenceConflict(entityType, id)
        .then((next) => {
          if (active) {
            setConflict(next);
            setError(null);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setError("The preserved conflict could not be read from encrypted local storage.");
            setLoading(false);
          }
        });
    };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (
        event.databaseFilePath.endsWith(workspace.databaseName) &&
        [
          entityType === "account" ? "accounts" : "categories",
          "sync_outbox",
          "sync_conflicts",
        ].includes(event.tableName)
      ) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [attempt, entityType, id, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { conflict, loading, error, retry };
}
