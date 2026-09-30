import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ROUTE_TITLES: Record<string, string> = {
  "/login": "Sign in — Zoption",
  "/signup": "Create account — Zoption",
  "/forgot-password": "Reset your password — Zoption",
  "/update-password": "Choose a new password — Zoption",
  "/auth/callback": "Signing you in — Zoption",
  "/onboarding": "Set up your workspace — Zoption",
  "/app": "Overview — Zoption",
  "/app/assistant": "Assistant — Zoption",
  "/app/calendar": "Calendar — Zoption",
  "/app/transactions": "Transactions — Zoption",
  "/app/import": "Import transactions — Zoption",
  "/app/budgets": "Budgets — Zoption",
  "/app/subscriptions": "Subscriptions — Zoption",
  "/app/settings": "Settings — Zoption",
  "/app/tutorials": "Tutorials & User Guides — Zoption",
  "/thank-you": "Thank You — Zoption",
};

function routeTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_TITLES[path] ?? (path.startsWith("/app/") ? "Zoption workspace" : "Zoption");
}

/**
 * The app is never indexed (index.html and every response say noindex), so the
 * only per-route head state it keeps is the tab title.
 */
export function RouteTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = routeTitle(pathname);
  }, [pathname]);

  return null;
}
