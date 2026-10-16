import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { captureFunnelEvent, type AppPage } from "./funnel";

const APP_PAGES: Record<string, AppPage> = {
  "/app": "overview",
  "/app/assistant": "assistant",
  "/app/calendar": "calendar",
  "/app/transactions": "transactions",
  "/app/import": "import",
  "/app/budgets": "budgets",
  "/app/subscriptions": "subscriptions",
  "/app/plan": "plan",
  "/app/pet": "pet",
  "/app/settings": "settings",
  "/app/tutorials": "tutorials",
  "/app/support/reports": "support",
};

/** Maps a pathname to its page name; anything unlisted (admin, public routes) is untracked. */
export function appPageForPath(pathname: string): AppPage | undefined {
  return APP_PAGES[pathname.replace(/\/+$/, "")];
}

/**
 * Sends one `page_viewed` per signed-in page visit, keyed on the path alone so
 * a filter or search in the query string never counts as a visit or leaves the
 * browser. The event carries only the fixed page name, never the URL.
 */
export function AppPageViewed() {
  const { pathname } = useLocation();

  useEffect(() => {
    const page = appPageForPath(pathname);
    if (page) captureFunnelEvent("page_viewed", { page });
  }, [pathname]);

  return null;
}
