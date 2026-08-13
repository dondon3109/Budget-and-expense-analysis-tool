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

import { closeLocalWorkspace, openLocalWorkspace, type LocalWorkspace } from "./workspace";
import type { LocalWorkspaceStats } from "./repository";

export type LocalWorkspaceStatus = "opening" | "ready" | "error";

interface LocalWorkspaceSnapshot {
  status: LocalWorkspaceStatus;
  workspace: LocalWorkspace | null;
  message: string | null;
  retry: () => void;
}

const LocalWorkspaceContext = createContext<LocalWorkspaceSnapshot | null>(null);

export function LocalWorkspaceProvider({
  subject,
  children,
}: PropsWithChildren<{ subject: string }>) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<LocalWorkspaceSnapshot, "retry">>({
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
            message:
              error instanceof Error
                ? error.message
                : "The encrypted local workspace could not be opened.",
          });
        }
      });

    return () => {
      requestRef.current += 1;
      void closeLocalWorkspace(subject);
    };
  }, [attempt, subject]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...snapshot, retry }), [retry, snapshot]);
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
