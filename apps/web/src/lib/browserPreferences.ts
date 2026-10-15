import { useSyncExternalStore } from "react";

/** An on/off choice this browser remembers in localStorage. It is never synced to the account. */
export interface BrowserPreference {
  get: () => boolean;
  set: (value: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

function booleanPreference(key: string, fallback: boolean): BrowserPreference {
  const listeners = new Set<() => void>();
  // The last choice made on this page, for when storage refuses to keep it.
  let unsaved: boolean | undefined;
  const notify = () => listeners.forEach((listener) => listener());
  return {
    get: () => {
      try {
        const saved = window.localStorage.getItem(key);
        if (saved === "on") return true;
        if (saved === "off") return false;
      } catch {
        // Storage may be unavailable; fall through.
      }
      return unsaved ?? fallback;
    },
    set: (value) => {
      unsaved = value;
      try {
        window.localStorage.setItem(key, value ? "on" : "off");
      } catch {
        // Ignore quota or private browsing storage failures; the choice lasts this page view.
      }
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      // Another tab changed it.
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

/** Pet sounds and other UI sounds. On by default. */
export const soundEffectsPreference = booleanPreference("zoption-sound-effects", true);

/** The in-app Reduce Motion switch. Off by default; it only adds to the browser setting. */
export const reduceMotionPreference = booleanPreference("zoption-reduce-motion", false);

/** The current value of a browser preference, re-rendering when it changes. */
export function useBrowserPreference(preference: BrowserPreference): boolean {
  return useSyncExternalStore(preference.subscribe, preference.get, preference.get);
}
