import {
  familyCreateSchema,
  familyInviteSchema,
  familyRoleUpdateSchema,
  familySeatRulesSchema,
  familyTransferSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import type { FamilyService } from "../families";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";

/**
 * The signed-in person's side of families under `/api/app/families`: create one, answer
 * invitations, and leave. These never take the workspace header; they act as the person.
 */
export function createFamilyRoutes(families: FamilyService) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/", async (context) => {
    const input = parseInput(
      familyCreateSchema,
      await readJson(context),
      "Name the family and accept the seat rules.",
    );
    return context.json(
      await families.create(context.env, context.get("authUser"), input.name),
      201,
    );
  });

  routes.get("/invitations", async (context) =>
    context.json(await families.invitations(context.env, context.get("authUser"))),
  );

  routes.post("/invitations/:invitationId/accept", async (context) => {
    parseInput(familySeatRulesSchema, await readJson(context), "Accept the seat rules first.");
    await families.accept(
      context.env,
      context.get("authUser"),
      parsePathParameter(context.req.param("invitationId")),
    );
    return context.body(null, 204);
  });

  routes.post("/invitations/:invitationId/decline", async (context) => {
    await families.decline(
      context.env,
      context.get("authUser"),
      parsePathParameter(context.req.param("invitationId")),
    );
    return context.body(null, 204);
  });

  routes.post("/:familyId/leave", async (context) => {
    await families.leave(
      context.env,
      context.get("authUser"),
      parsePathParameter(context.req.param("familyId")),
    );
    return context.body(null, 204);
  });

  return routes;
}

/**
 * The active family under `/api/app/family`, named by the workspace header. Everyone in it can
 * read the detail; the rest is owner only.
 */
export function createActiveFamilyRoutes(families: FamilyService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/", async (context) =>
    context.json(await families.detail(context.env, context.get("tenant"))),
  );

  routes.post("/invitations", async (context) => {
    const input = parseInput(
      familyInviteSchema,
      await readJson(context),
      "Send an email address and a role.",
    );
    await families.invite(context.env, context.get("tenant"), context.get("authUser"), input);
    return context.body(null, 204);
  });

  routes.post("/invitations/:invitationId/resend", async (context) => {
    await families.resend(
      context.env,
      context.get("tenant"),
      parsePathParameter(context.req.param("invitationId")),
    );
    return context.body(null, 204);
  });

  routes.delete("/invitations/:invitationId", async (context) => {
    await families.revoke(
      context.env,
      context.get("tenant"),
      parsePathParameter(context.req.param("invitationId")),
    );
    return context.body(null, 204);
  });

  routes.patch("/members/:userId", async (context) => {
    const input = parseInput(familyRoleUpdateSchema, await readJson(context), "Choose a role.");
    await families.setRole(
      context.env,
      context.get("tenant"),
      parsePathParameter(context.req.param("userId")),
      input.role,
    );
    return context.body(null, 204);
  });

  // A POST rather than a DELETE with a body: removal must carry the seat-rules acknowledgement.
  routes.post("/members/:userId/remove", async (context) => {
    parseInput(familySeatRulesSchema, await readJson(context), "Accept the seat rules first.");
    await families.remove(
      context.env,
      context.get("tenant"),
      context.get("authUser"),
      parsePathParameter(context.req.param("userId")),
    );
    return context.body(null, 204);
  });

  // Members keep reading and exporting until the closing period ends; the auth middleware
  // refuses every other write from here on.
  routes.post("/close", async (context) =>
    context.json(await families.close(context.env, context.get("tenant"), context.get("authUser"))),
  );

  routes.post("/transfer", async (context) => {
    const input = parseInput(
      familyTransferSchema,
      await readJson(context),
      "Choose the member who will own the family.",
    );
    await families.transfer(
      context.env,
      context.get("tenant"),
      context.get("authUser"),
      input.userId,
    );
    return context.body(null, 204);
  });

  return routes;
}
