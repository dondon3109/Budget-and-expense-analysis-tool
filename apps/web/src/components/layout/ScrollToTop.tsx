import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Lazy routes and data-gated sections mount their hash target after the location changes, so a
// single lookup misses it and the reader lands at the top of the page instead of the anchor.
const HASH_TARGET_POLL_MS = 50;
const HASH_TARGET_DEADLINE_MS = 1000;

function scrollToTop(): void {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  } catch {
    window.scrollTo(0, 0);
  }
}

export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const targetId = hash.slice(1);
    if (targetId) {
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView();
        return;
      }

      const deadline = Date.now() + HASH_TARGET_DEADLINE_MS;
      // A page can answer the hash itself: SettingsPage maps aliases such as #voice-settings onto a
      // section it reveals and scrolls to in a frame. If the reader moved while we waited, that
      // reveal is the right destination and the fallback below must not undo it.
      const startScrollY = window.scrollY;
      const timer = window.setInterval(() => {
        const target = document.getElementById(targetId);
        if (target) {
          window.clearInterval(timer);
          target.scrollIntoView();
          return;
        }
        if (Date.now() >= deadline) {
          window.clearInterval(timer);
          if (window.scrollY === startScrollY) scrollToTop();
        }
      }, HASH_TARGET_POLL_MS);
      // Clearing on cleanup keeps a stale hash from scrolling a page navigated to afterwards.
      return () => window.clearInterval(timer);
    }

    scrollToTop();
  }, [pathname, search, hash]);

  return null;
}
