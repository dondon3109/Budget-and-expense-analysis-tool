import { useLayoutEffect } from "react";

type SavedRootState = {
  inert: boolean;
  ariaHidden: string | null;
} | null;

let activeLocks = 0;
let savedOverflow = "";
let savedRootState: SavedRootState = null;

function acquireRootLock() {
  const root = typeof document !== "undefined" ? document.getElementById("root") : null;
  if (activeLocks === 0) {
    savedOverflow = document.body.style.overflow;
    savedRootState = root
      ? { inert: root.inert ?? false, ariaHidden: root.getAttribute("aria-hidden") }
      : null;
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;
}

function releaseRootLock() {
  if (activeLocks <= 0) return;
  activeLocks -= 1;
  if (activeLocks !== 0) return;

  const root = typeof document !== "undefined" ? document.getElementById("root") : null;
  if (root && savedRootState) {
    root.inert = savedRootState.inert;
    if (savedRootState.ariaHidden === null) root.removeAttribute("aria-hidden");
    else root.setAttribute("aria-hidden", savedRootState.ariaHidden);
  }
  document.body.style.overflow = savedOverflow;
  savedOverflow = "";
  savedRootState = null;
}

/**
 * Locks the application root (inert + aria-hidden) and body scroll while any
 * overlay or modal holds it open. Multiple overlays can be open at once the
 * same time; the lock is refcounted so only the first opener records the prior
 * state and only the last closer restores it. This prevents two overlays from
 * clobbering each other's saved state and leaving the page inert/scroll-locked
 * after one of them closes.
 */
export function useRootLock(locked: boolean) {
  useLayoutEffect(() => {
    if (!locked) return undefined;
    acquireRootLock();
    return () => {
      releaseRootLock();
    };
  }, [locked]);
}
