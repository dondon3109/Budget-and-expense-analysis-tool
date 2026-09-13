import { useCallback, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";

/**
 * Shared unsaved-changes guard.
 *
 * `useUnsavedChangesWarning(dirty)` does two things while `dirty` is true:
 *  - asks the browser to confirm before an unload (reload, tab close, typed navigation);
 *  - registers the page with the in-app guard that AppShell consults, so a sidebar link,
 *    a mobile tab or sign-out cannot discard the draft silently.
 *
 * `options.onDiscard` lets the page release whatever it persisted for the draft, so a
 * confirmed discard really does throw the work away rather than restore it later.
 *
 * Boundaries, kept explicit here so the limitation stays visible: the shell plus a page's
 * own controls are the interception points. Links rendered by other page content, browser
 * back/forward, and redirects performed by route guards are not intercepted — the page
 * unmounts on popstate before a guard could run. React Router's useBlocker is unavailable
 * because the app uses BrowserRouter rather than a data router, so pages that must not lose
 * work persist it instead (see src/lib/budgetDraft.ts). A page that never registers dirty
 * state leaves navigation exactly as it was.
 */

type Listener = () => void;

export interface UnsavedChangesOptions {
  /** Called when the user confirms they want to discard the edits. */
  onDiscard?: () => void;
}

/** Mounted hooks that currently hold unsaved edits, with their discard callbacks. */
const dirtyEdits = new Map<string, (() => void) | undefined>();
const listeners = new Set<Listener>();
let hasDirtyEdits = false;

function publishDirtyEdits() {
  const next = dirtyEdits.size > 0;
  if (next === hasDirtyEdits) return;
  hasDirtyEdits = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return hasDirtyEdits;
}

/** True while any mounted page holds unsaved edits. AppShell gates its own links on it. */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Releases every registered draft. The shell calls this once a discard is confirmed. */
export function useDiscardUnsavedChanges(): () => void {
  return useCallback(() => {
    for (const onDiscard of dirtyEdits.values()) onDiscard?.();
  }, []);
}

export function useUnsavedChangesWarning(dirty: boolean, options: UnsavedChangesOptions = {}) {
  // useId is stable for the lifetime of the component, so a page can register and
  // unregister itself without a second source of truth.
  const registrationId = useId();
  const onDiscardRef = useRef(options.onDiscard);
  onDiscardRef.current = options.onDiscard;

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return undefined;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Chromium and Firefox need returnValue set to raise the confirmation.
      event.returnValue = "";
      return "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  // A layout effect so the guard is armed in the same commit that makes the page dirty:
  // a click that follows the last keystroke must never find the store still clean.
  useLayoutEffect(() => {
    if (!dirty) return undefined;
    dirtyEdits.set(registrationId, () => onDiscardRef.current?.());
    publishDirtyEdits();
    return () => {
      dirtyEdits.delete(registrationId);
      publishDirtyEdits();
    };
  }, [dirty, registrationId]);
}
