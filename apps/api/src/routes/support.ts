import { bugReportCreateSchema, bugReportStatusUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AssistantProvider } from "../assistant/provider";
import { HttpError } from "../errors";
import { readJson } from "../request";
import { completeSupportChat, supportChatInputSchema } from "../support/service";
import type { BugReportService } from "../support/bug-reports";
import type { PlatformAdminService } from "../platform-admin";
import type { AppEnvironment } from "../types";

export function createSupportRoutes(provider: AssistantProvider) {
  const routes = new Hono<AppEnvironment>();

  routes.use("*", async (context, next) => {
    if (context.env.ASSISTANT_ENABLED !== "true") {
      throw new HttpError(404, "support_not_enabled", "Zoption Support is not available.");
    }
    await next();
  });

  routes.post("/chat", async (context) => {
    const parsed = supportChatInputSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a valid support message of 1,200 characters or fewer.",
        parsed.error.flatten(),
      );
    }
    return context.json(await completeSupportChat(context.env, provider, parsed.data));
  });

  return routes;
}

export function createAuthenticatedSupportRoutes(
  provider: AssistantProvider,
  bugReports: BugReportService,
) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/chat", async (context) => {
    const parsed = supportChatInputSchema.safeParse(await readJson(context));
    if (!parsed.success || parsed.data.pageContext === "landing") {
      throw new HttpError(
        400,
        "invalid_request",
        "Enter a valid signed-in support message of 1,200 characters or fewer.",
        parsed.success ? undefined : parsed.error.flatten(),
      );
    }
    return context.json(
      await completeSupportChat(context.env, provider, parsed.data, { bugReportDrafting: true }),
    );
  });

  routes.post("/bug-reports", async (context) => {
    const parsed = bugReportCreateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_bug_report",
        "Review the bug report and complete every required field.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await bugReports.create(
        context.env,
        context.get("tenant").tenantId,
        context.get("authUser"),
        parsed.data,
      ),
      201,
    );
  });

  routes.get("/bug-reports", async (context) =>
    context.json(await bugReports.listForReporter(context.env, context.get("tenant").tenantId)),
  );

  routes.get("/bug-reports/:id", async (context) => {
    const id = z.string().uuid().safeParse(context.req.param("id"));
    if (!id.success) throw new HttpError(404, "bug_report_not_found", "Bug report not found.");
    return context.json(
      await bugReports.getForReporter(context.env, context.get("tenant").tenantId, id.data),
    );
  });

  return routes;
}

export function createBugReportAdminRoutes(
  bugReports: BugReportService,
  platformAdmins: PlatformAdminService,
) {
  const routes = new Hono<AppEnvironment>();

  routes.use("*", async (context, next) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    await next();
  });

  routes.get("/", async (context) => context.json(await bugReports.listForAdmin(context.env)));

  routes.patch("/:id", async (context) => {
    const id = z.string().uuid().safeParse(context.req.param("id"));
    const input = bugReportStatusUpdateSchema.safeParse(await readJson(context));
    if (!id.success) throw new HttpError(404, "bug_report_not_found", "Bug report not found.");
    if (!input.success) {
      throw new HttpError(400, "invalid_bug_report_status", "Choose a valid report status.");
    }
    return context.json(await bugReports.updateStatus(context.env, id.data, input.data.status));
  });

  return routes;
}
