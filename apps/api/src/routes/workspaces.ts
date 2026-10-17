import { Hono } from "hono";

import type { MembershipRepository } from "../db/memberships";
import type { AppEnvironment } from "../types";

/** The signed-in person's workspaces under `/api/app/workspaces`, for the workspace switcher. */
export function createWorkspaceRoutes(memberships: MembershipRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await memberships.list(context.env, context.get("authUser").id)),
  );

  return routes;
}
