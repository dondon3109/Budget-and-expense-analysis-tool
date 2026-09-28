import { useCallback, useEffect, useState } from "react";

import type { LocalWorkspace } from "../workspace";
import { subscribeToLocalChanges } from "./change-stream";

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
}

export interface LocalQueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Reads workspace data and re-reads it whenever one of `tables` changes. A rejected read keeps the
 * last value and reports `errorMessage`; a result that lands after unmount or after the inputs
 * changed is dropped.
 */
export function useLocalQuery<T>(
  workspace: LocalWorkspace | null,
  { read, tables, empty, errorMessage, initialLoading }: LocalQueryOptions<T>,
): LocalQueryResult<T> {
  const trackLoading = initialLoading !== undefined;
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(initialLoading ?? false);
  const [error, setError] = useState<string | null>(null);
  // Callers pass table lists inline; the joined key keeps a new array from re-running the effect.
  const tableKey = tables.join(",");

  useEffect(() => {
    if (!workspace || !read) {
      setData(empty);
      if (trackLoading) setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    const refresh = (): void => {
      if (trackLoading) setLoading(true);
      void read(workspace)
        .then((next) => {
          if (active) {
            setData(next);
            setError(null);
            if (trackLoading) setLoading(false);
          }
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(typeof errorMessage === "string" ? errorMessage : errorMessage(cause));
            if (trackLoading) setLoading(false);
          }
        });
    };
    refresh();
    const unsubscribe = subscribeToLocalChanges(
      workspace.databaseName,
      tableKey.split(","),
      refresh,
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt, empty, errorMessage, read, tableKey, trackLoading, workspace]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, loading, error, retry };
}
