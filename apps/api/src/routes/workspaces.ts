import { Hono } from "hono";

import type { MembershipRepository } from "../db/memberships";
import type { AppEnvironment } from "../types";

/** The signed-in person's workspaces under `/api/app/workspaces`, for the workspace switcher. */
export function createWorkspaceRoutes(memberships: MembershipRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json({
      workspaces: await memberships.list(context.env, context.get("authUser").id),
      familiesAvailable: context.env.FAMILY_WORKSPACES_ENABLED === "true",
    }),
  );

  return routes;
}
