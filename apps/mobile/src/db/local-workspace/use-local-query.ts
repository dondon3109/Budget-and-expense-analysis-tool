import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { telemetry } from "@/telemetry/telemetry";

import type { LocalWorkspace } from "../workspace";
import { subscribeToLocalChanges } from "./change-stream";

const CLOSED_DATABASE_ERROR = /Access to closed resource|database(?: connection)? is closed/i;

function isClosedWorkspaceError(workspace: LocalWorkspace, cause: unknown): boolean {
  if (workspace.closed) return true;
  return cause instanceof Error && CLOSED_DATABASE_ERROR.test(cause.message);
}

const LocalQueryActiveContext = createContext<boolean>(true);

/**
 * Pauses table-change re-reads for a hidden subtree (such as a blurred tab or an
 * inactive view pane). While inactive, changes record a dirty flag instead of
 * re-querying SQLite; the hook refreshes once as soon as the subtree is active again.
 */
export function LocalQueryActivity({ active, children }: PropsWithChildren<{ active: boolean }>) {
  const parentActive = useContext(LocalQueryActiveContext);
  return createElement(
    LocalQueryActiveContext.Provider,
    { value: parentActive && active },
    children,
  );
}

export interface LocalQueryOptions<T> {
  /**
   * Reads the value from the open workspace, or null while a required argument (such as an id) is
   * missing. Memoize it: a new function re-runs the query.
   */
  read: ((workspace: LocalWorkspace) => Promise<T>) | null;
  /** Tables whose changes re-run `read`. */
  tables: readonly string[];
  /** Value before the first read and while the query is disabled. Pass a stable value. */
  empty: T;
  /** Error text when `read` rejects. Pass a string or a module-level function. */
  errorMessage: string | ((cause: unknown) => string);
  /**
   * Starting value of `loading` for hooks that report one. Leave it unset for hooks without a
   * loading flag, so a refresh does not cost them the extra renders of toggling it.
   */
  initialLoading?: boolean;
  /**
   * Called when a read fails because the workspace handle was closed, or when the user retries on
   * a closed handle, so the provider can reopen a fresh connection instead of staying stuck.
   */
  onClosedWorkspace?: () => void;
}

export interface LocalQueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Reads workspace data and re-reads it whenever one of `tables` changes. A rejected read keeps the
 * last value and reports `errorMessage`; a result that lands after unmount, after the inputs
 * changed, or after a newer read started is dropped.
 */
export function useLocalQuery<T>(
  workspace: LocalWorkspace | null,
  { read, tables, empty, errorMessage, initialLoading, onClosedWorkspace }: LocalQueryOptions<T>,
): LocalQueryResult<T> {
  const trackLoading = initialLoading !== undefined;
  const queryActive = useContext(LocalQueryActiveContext);
  const queryActiveRef = useRef(queryActive);
  queryActiveRef.current = queryActive;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const onClosedWorkspaceRef = useRef(onClosedWorkspace);
  onClosedWorkspaceRef.current = onClosedWorkspace;
  const reopenedForRef = useRef<LocalWorkspace | null>(null);
  const dirtyRef = useRef(false);
  const flushRef = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(initialLoading ?? false);
  const [error, setError] = useState<string | null>(null);
  // Callers pass table lists inline; the joined key keeps a new array from re-running the effect.
  const tableKey = tables.join(",");

  useEffect(() => {
    dirtyRef.current = false;
    flushRef.current = null;
    if (!workspace || !read) {
      setData(empty);
      if (trackLoading) setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    let requestSeq = 0;
    let settled = false;
    const runRead = (showLoading: boolean): void => {
      const requestId = ++requestSeq;
      if (trackLoading && showLoading) setLoading(true);
      void read(workspace)
        .then((next) => {
          if (!active || requestId !== requestSeq) return;
          settled = true;
          setData(next);
          setError(null);
          if (trackLoading) setLoading(false);
        })
        .catch((cause: unknown) => {
          if (!active || requestId !== requestSeq) return;
          settled = true;
          if (isClosedWorkspaceError(workspace, cause)) {
            workspace.closed = true;
            if (onClosedWorkspaceRef.current && reopenedForRef.current !== workspace) {
              reopenedForRef.current = workspace;
              onClosedWorkspaceRef.current();
              return;
            }
          }
          void telemetry.captureException(cause, "local-query");
          setError(typeof errorMessage === "string" ? errorMessage : errorMessage(cause));
          if (trackLoading) setLoading(false);
        });
    };
    const refreshFromChange = (): void => {
      if (!queryActiveRef.current) {
        dirtyRef.current = true;
        return;
      }
      dirtyRef.current = false;
      runRead(!settled);
    };
    flushRef.current = () => {
      dirtyRef.current = false;
      runRead(!settled);
    };
    runRead(true);
    const unsubscribe = subscribeToLocalChanges(
      workspace.databaseName,
      tableKey.split(","),
      refreshFromChange,
    );
    return () => {
      active = false;
      flushRef.current = null;
      unsubscribe();
    };
  }, [attempt, empty, errorMessage, read, tableKey, trackLoading, workspace]);

  useEffect(() => {
    if (queryActive && dirtyRef.current) {
      flushRef.current?.();
    }
  }, [queryActive]);

  const retry = useCallback(() => {
    if (workspaceRef.current?.closed && onClosedWorkspaceRef.current) {
      onClosedWorkspaceRef.current();
    }
    setAttempt((value) => value + 1);
  }, []);
  return { data, loading, error, retry };
}
