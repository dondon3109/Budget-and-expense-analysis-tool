import { usePathname } from "expo-router";
import { useEffect } from "react";

import { telemetry } from "./telemetry";

/**
 * Signed-in routes and the fixed name `screen_viewed` reports for each, the
 * mobile counterpart of the web app's `page_viewed`. Conflict screens and
 * anything unlisted are not reported. Route params never leave the device.
 */
const SCREENS: Record<string, string> = {
  "/": "home",
  "/transactions": "transactions",
  "/budgets": "budgets",
  "/more": "more",
  "/assistant": "assistant",
  "/calendar": "calendar",
  "/categories": "categories",
  "/debts": "debts",
  "/goals": "goals",
  "/subscriptions": "subscriptions",
  "/import": "import",
  "/pet": "pet",
  "/receipt-scan": "receipt_scan",
  "/support": "support",
  "/tutorials": "tutorials",
  "/account": "account",
  "/plan-billing": "plan_billing",
  "/money-setup": "money_setup",
  "/transaction": "transaction_editor",
  "/debt": "debt_editor",
  "/goal": "goal_editor",
  "/subscription": "subscription_editor",
  "/event": "event_editor",
  "/widget-intent": "widget_review",
};

export function screenForPath(pathname: string): string | undefined {
  return SCREENS[pathname.replace(/(.)\/+$/, "$1")];
}

/** Sends one `screen_viewed` per signed-in route change; mounted once in the authenticated gate. */
export function ScreenViewedTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const screen = screenForPath(pathname);
    if (screen) void telemetry.capture("screen_viewed", { screen });
  }, [pathname]);

  return null;
}
