import { Hono } from "hono";

import type { AppEnvironment, AuthUser, Bindings, TenantContext } from "../../src/types";

/**
 * A Hono app whose middleware stubs the auth context, so a route factory can be
 * exercised without the real auth middleware. Tenant and env bindings are only
 * assigned when given: tests that assert a repository saw an unset value rely on
 * them staying unset.
 */
export function createTestApp(
  options: { user?: AuthUser; tenant?: TenantContext; env?: Bindings } = {},
): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>();
  app.use("*", async (c, next) => {
    c.set("authUser", options.user ?? { id: "admin" });
    if (options.tenant) c.set("tenant", options.tenant);
    if (options.env) c.env = options.env;
    await next();
  });
  return app;
}
