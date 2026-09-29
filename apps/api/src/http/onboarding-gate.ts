import type { MiddlewareHandler } from "hono";

import { HttpError } from "../errors";
import type { AppEnvironment } from "../types";

/**
 * Paths a workspace can reach before onboarding finishes: onboarding itself, what the web shell
 * needs to start, identity sync, account deletion, and support. Sync stays open because the
 * native apps have no onboarding screens.
 */
const OPEN_BEFORE_ONBOARDING = [
  "/api/app/onboarding",
  "/api/app/me",
  "/api/app/settings",
  "/api/app/identity",
  "/api/app/account",
  "/api/app/support",
  "/api/app/sync",
];

/** Runs after authentication. Skipped paths have no tenant and are never gated here. */
export const requireOnboarding: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const tenant = context.get("tenant");
  if (tenant && !tenant.onboardingComplete) {
    const path = context.req.path;
    const open = OPEN_BEFORE_ONBOARDING.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (!open) {
      throw new HttpError(403, "onboarding_required", "Finish setting up your workspace first.");
    }
  }
  await next();
};
