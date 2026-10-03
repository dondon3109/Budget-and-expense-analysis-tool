import type { MiddlewareHandler } from "hono";

import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

/**
 * The ledger routes the web app reads to draw the workspace. Only these wait for onboarding: the
 * native apps offer onboarding on a dismissible screen and use sync, billing, assistant, imports,
 * receipts, and entry from their first launch, so those stay open.
 */
const GATED_UNTIL_ONBOARDED = [
  "/api/app/dashboard",
  "/api/app/accounts",
  "/api/app/categories",
  "/api/app/budgets",
  "/api/app/goals",
  "/api/app/debts",
  "/api/app/events",
  "/api/app/subscriptions",
];

/** Runs after authentication. Skipped paths have no tenant and are never gated here. */
export const requireOnboarding: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const tenant = context.get("tenant");
  if (tenant && !tenant.onboardingComplete) {
    const path = context.req.path;
    const gated = GATED_UNTIL_ONBOARDED.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (gated) {
      throw new HttpError(403, "onboarding_required", "Finish setting up your workspace first.");
    }
  }
  await next();
};
