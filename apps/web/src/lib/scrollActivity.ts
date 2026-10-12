const SETTLE_MS = 900;

/**
 * Marks whatever is scrolling (the page or any element) with `data-scrolling` until it has been
 * still for a moment, so foundation.css can show scroll bars only while they are in use. Scroll
 * events do not bubble, so one capturing listener on the document sees every scroller.
 */
export function trackScrollActivity(): void {
  const timers = new WeakMap<Element, number>();
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target instanceof Element ? event.target : document.documentElement;
      target.setAttribute("data-scrolling", "");
      window.clearTimeout(timers.get(target));
      timers.set(
        target,
        window.setTimeout(() => target.removeAttribute("data-scrolling"), SETTLE_MS),
      );
    },
    { capture: true, passive: true },
  );
}
