interface ServiceWorkerRegistrationOptions {
  enabled?: boolean;
  container?: ServiceWorkerContainer;
  eventTarget?: Window;
  readyState?: DocumentReadyState;
}

export function registerZoptionServiceWorker(
  options: ServiceWorkerRegistrationOptions = {},
): () => void {
  const enabled = options.enabled ?? import.meta.env.PROD;
  const hasContainer =
    options.container || (typeof navigator !== "undefined" && "serviceWorker" in navigator);
  if (!enabled || typeof window === "undefined" || !hasContainer) {
    return () => undefined;
  }

  const container = options.container ?? navigator.serviceWorker;
  const eventTarget = options.eventTarget ?? window;

  function register() {
    void container
      .register("/service-worker.js", {
        scope: "/",
        type: "module",
        updateViaCache: "none",
      })
      .catch(() => {
        // Chrome will keep the site usable in a tab if registration is unavailable.
      });
  }

  if ((options.readyState ?? document.readyState) === "complete") {
    register();
    return () => undefined;
  }

  eventTarget.addEventListener("load", register, { once: true });
  return () => eventTarget.removeEventListener("load", register);
}
