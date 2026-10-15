import { useSyncExternalStore } from "react";

import { reduceMotionPreference } from "../lib/browserPreferences";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function mediaQuery(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(reducedMotionQuery)
    : null;
}

/** True when either the in-app switch or the browser's Reduce Motion setting is on. */
function reduceMotionActive(): boolean {
  return reduceMotionPreference.get() || (mediaQuery()?.matches ?? false);
}

function subscribe(listener: () => void): () => void {
  const query = mediaQuery();
  query?.addEventListener?.("change", listener);
  const unsubscribe = reduceMotionPreference.subscribe(listener);
  return () => {
    query?.removeEventListener?.("change", listener);
    unsubscribe();
  };
}

/**
 * Keeps `data-reduce-motion` on `<html>` in step with `reduceMotionActive`. Every stylesheet keys
 * its reduced-motion rules off that attribute rather than the media query, so the in-app switch
 * reaches CSS too. Called once from the entry, before the first render.
 */
export function syncReduceMotionAttribute(): void {
  const apply = () => {
    document.documentElement.toggleAttribute("data-reduce-motion", reduceMotionActive());
  };
  apply();
  subscribe(apply);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reduceMotionActive, () => false);
}
