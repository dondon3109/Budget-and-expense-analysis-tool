import { familyCommentInputSchema, familyCommentSubjectSchema } from "@zoption/shared";
import { Hono } from "hono";

import type { FamilyCommentRepository } from "../db/family-comments";
import type { FamilyNotifier } from "../family-notifier";
import { parseInput, parsePathParameter, readJson } from "../request";
import type { AppEnvironment } from "../types";
import { afterResponse, familyTenantId } from "./remittances";

const PREVIEW_LENGTH = 80;

/**
 * `/api/app/family/comments`: a thread under one family transaction or remittance. Everyone
 * reads; viewers are refused writes by the auth middleware.
 */
export function createFamilyCommentRoutes(
  comments: FamilyCommentRepository,
  notifier: FamilyNotifier,
) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/:kind/:subjectId", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    const subject = parseInput(familyCommentSubjectSchema, context.req.param(), "Choose an entry.");
    return context.json({ comments: await comments.list(context.env, tenantId, subject) });
  });

  routes.post("/:kind/:subjectId", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    const subject = parseInput(familyCommentSubjectSchema, context.req.param(), "Choose an entry.");
    const input = parseInput(familyCommentInputSchema, await readJson(context), "Write a comment.");
    const userId = context.get("authUser").id;
    const added = await comments.add(context.env, tenantId, userId, subject, input.body);
    if (added.audience.length > 0) {
      const preview =
        input.body.length > PREVIEW_LENGTH ? `${input.body.slice(0, PREVIEW_LENGTH)}…` : input.body;
      await afterResponse(
        context,
        notifier.notify(context.env, {
          familyTenantId: tenantId,
          category: "comment_reply",
          title: `New comment on ${added.subjectLabel}`,
          body: preview,
          onlyUserIds: added.audience,
          subject,
        }),
      );
    }
    return context.json(added.comment, 201);
  });

  routes.delete("/:id", async (context) => {
    const tenant = context.get("tenant");
    const tenantId = familyTenantId(tenant);
    const userId = context.get("authUser").id;
    const authorOnly = tenant.membership?.role === "owner" ? undefined : userId;
    await comments.remove(
      context.env,
      tenantId,
      parsePathParameter(context.req.param("id")),
      authorOnly,
    );
    return context.body(null, 204);
  });

  return routes;
}
