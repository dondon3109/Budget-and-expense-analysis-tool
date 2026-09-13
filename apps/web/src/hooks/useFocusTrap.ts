import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export interface FocusTrapOptions {
  /** Invoked when the user presses Escape inside the container. Omit to ignore Escape. */
  onEscape?: () => void;
  /** Element to focus when the trap activates. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Element to restore focus to when the trap releases. Defaults to whatever had focus on activation. */
  returnFocus?: HTMLElement | null;
}

function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0,
  );
}

/**
 * Confines Tab navigation to a container, handles Escape, and returns focus to the
 * element that opened it. Pair with useRootLock so the rest of the page is inert
 * while the trap is active.
 *
 * Escape calls stopPropagation so a dialog opened from inside another dialog closes
 * only the topmost one: React portals bubble through the React tree, so without it
 * the parent dialog's handler would fire too.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  options: FocusTrapOptions = {},
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeElement = document.activeElement;
    const { returnFocus, initialFocusRef } = optionsRef.current;
    const opener =
      returnFocus?.isConnected === true
        ? returnFocus
        : activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;

    (initialFocusRef?.current ?? focusableWithin(container)[0])?.focus();

    return () => {
      if (opener?.isConnected) opener.focus();
    };
    // Mount-only on purpose: re-running would steal focus back on every render.
    // options are read through a ref so this effect never needs to re-run.
  }, []);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        if (!optionsRef.current.onEscape) return;
        event.preventDefault();
        event.stopPropagation();
        optionsRef.current.onEscape();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = focusableWithin(container);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      const active = document.activeElement;
      const outside = !container.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    },
    [containerRef],
  );
}
