import { Hono } from "hono";

import { createAuthMiddleware } from "./auth";
import { servePublicAvatar } from "./avatars";
import { createDependencies, type AppOptions } from "./composition";
import { HttpError } from "./errors";
import {
  appBodyLimits,
  createBillingWebhookBodyLimit,
  supportBodyLimits,
} from "./http/body-limits";
import { corsAndSecurityHeaders } from "./http/cors";
import { requireOnboarding } from "./http/onboarding-gate";
import {
  createAppRateLimit,
  createBillingWebhookRateLimit,
  createSupportRateLimit,
} from "./http/rate-limit-policy";
import { createAccountDeletionRoutes } from "./routes/account-deletion";
import { createAccountRoutes } from "./routes/accounts";
import { createAdminProviderConfigRoutes } from "./routes/admin-provider-configs";
import { createAiEntryRoutes } from "./routes/ai-entry";
import { createAssistantRoutes } from "./routes/assistant";
import { createAssistantVoiceRoutes } from "./routes/assistant-voice";
import { createAvatarRoutes } from "./routes/avatars";
import { createBillingRoutes } from "./routes/billing";
import { createBudgetRoutes } from "./routes/budgets";
import { createCategoryRoutes } from "./routes/categories";
import {
  createAdminCustomerReviewRoutes,
  createAuthenticatedCustomerReviewRoutes,
  createPublicCustomerReviewRoutes,
} from "./routes/customer-reviews";
import { createDashboardRoutes } from "./routes/dashboard";
import { createDebtRoutes } from "./routes/debts";
import { createDodoWebhookRoutes } from "./routes/dodo-webhooks";
import { createCalendarEventRoutes } from "./routes/events";
import { createExportRoutes } from "./routes/exports";
import { createFinancialGoalRoutes } from "./routes/goals";
import { createImportRoutes } from "./routes/imports";
import { createMobileSyncRoutes } from "./routes/mobile-sync";
import { createGoalProfileRoutes } from "./routes/goal-profile";
import { createPetRoutes } from "./routes/pet";
import { createOnboardingRoutes } from "./routes/onboarding";
import { createBugReportEgressRoutes } from "./routes/ops-bug-report-egress";
import { createPayPalWebhookRoutes } from "./routes/paypal-webhooks";
import { createIdentityRoutes, createPlatformAdminRoutes } from "./routes/platform-admin";
import { createProviderCredentialRoutes } from "./routes/provider-credentials";
import { createReceiptRoutes } from "./routes/receipts";
import { createSubscriptionRoutes } from "./routes/subscriptions";
import {
  createAuthenticatedSupportRoutes,
  createBugReportAdminRoutes,
  createSupportRoutes,
} from "./routes/support";
import { createTransactionRoutes } from "./routes/transactions";
import { createVoiceStreamRoutes } from "./routes/voice-stream";
import { createWorkspaceSettingsRoutes } from "./routes/workspace-settings";
import type { AppEnvironment } from "./types";

export type { AppOptions } from "./composition";

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnvironment>();
  const dependencies = createDependencies(options);

  app.use("/api/*", corsAndSecurityHeaders);

  app.get("/api/public/avatars/:userId/:file", (context) => {
    const path = `${context.req.param("userId")}/${context.req.param("file")}`;
    return servePublicAvatar(context.env, path);
  });

  app.use("/api/app/*", async (context, next) => {
    if (context.req.header("Upgrade")?.toLowerCase() === "websocket") {
      await next();
      return;
    }
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.use("/api/support/*", supportBodyLimits);

  app.use("/api/support/*", createSupportRateLimit(dependencies.rateLimiter));
  app.use(
    "/api/app/*",
    createAuthMiddleware(
      dependencies.authVerifier,
      dependencies.tenantResolver,
      (path, method) =>
        (method === "DELETE" && path === "/api/app/account") || path.startsWith("/api/app/admin/"),
    ),
  );
  app.use("/api/app/*", appBodyLimits);
  app.use("/api/app/*", createAppRateLimit(dependencies.rateLimiter));
  app.use("/api/app/*", requireOnboarding);

  app.get("/health", async (context) => {
    try {
      await dependencies.readinessCheck(context.env);
      return context.json({ status: "ok", service: "budget-expense-api" });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "API readiness check failed",
          name: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return context.json({ status: "unavailable", service: "budget-expense-api" }, 503);
    }
  });

  app.get("/api/app/me", (context) => {
    const user = context.get("authUser");
    return context.json({
      user: {
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
        ...(user.role ? { role: user.role } : {}),
      },
      tenantId: context.get("tenant").tenantId,
    });
  });

  app.route(
    "/api/app/dashboard",
    createDashboardRoutes(
      {
        dashboardLoader: dependencies.dashboardLoader,
        cashflowTrendLoader: dependencies.cashflowTrendLoader,
        transferFeeLoader: dependencies.transferFeeLoader,
      },
      dependencies.billing,
    ),
  );

  for (const [provider, routes] of [
    ["paypal", createPayPalWebhookRoutes(dependencies.billing)],
    ["dodo", createDodoWebhookRoutes(dependencies.billing)],
  ] as const) {
    const path = `/api/billing/${provider}/webhook`;
    app.use(path, createBillingWebhookRateLimit(dependencies.rateLimiter, provider));
    app.use(path, createBillingWebhookBodyLimit());
    app.route(path, routes);
  }
  app.route("/api/support", createSupportRoutes(dependencies.supportProvider));
  app.route("/api/reviews", createPublicCustomerReviewRoutes(dependencies.customerReviews));
  app.route(
    "/api/ops/bug-reports",
    createBugReportEgressRoutes(
      dependencies.bugReports,
      dependencies.bugReportEgressAudit,
      dependencies.bugReportEgressRedact,
    ),
  );
  app.route(
    "/api/app/admin/reviews",
    createAdminCustomerReviewRoutes(
      dependencies.customerReviews,
      dependencies.platformAdminService,
    ),
  );
  app.route(
    "/api/app/admin/bug-reports",
    createBugReportAdminRoutes(dependencies.bugReportService, dependencies.platformAdminService),
  );
  app.route(
    "/api/app/support",
    createAuthenticatedSupportRoutes(dependencies.supportProvider, dependencies.bugReportService),
  );
  app.route("/api/app/account", createAccountDeletionRoutes(dependencies.accountDeletionService));
  app.route("/api/app/profile/avatar", createAvatarRoutes());
  app.route("/api/app/identity", createIdentityRoutes(dependencies.platformAdminService));
  app.route("/api/app/admin", createPlatformAdminRoutes(dependencies.platformAdminService));
  app.route(
    "/api/app/admin/provider-configs",
    createAdminProviderConfigRoutes(dependencies.platformAdminService),
  );
  app.route(
    "/api/app/admin/provider-credentials",
    createProviderCredentialRoutes(dependencies.platformAdminService),
  );
  app.route(
    "/api/app/assistant/voice",
    createAssistantVoiceRoutes(dependencies.assistantVoiceService),
  );
  app.route(
    "/api/app/assistant/voice",
    createVoiceStreamRoutes(dependencies.assistantVoiceService),
  );
  app.route("/api/app/assistant", createAssistantRoutes(dependencies.assistantService));
  app.route("/api/app/transactions", createTransactionRoutes(dependencies.transactions));
  app.route(
    "/api/app/reviews",
    createAuthenticatedCustomerReviewRoutes(dependencies.customerReviews),
  );
  app.route("/api/app/accounts", createAccountRoutes(dependencies.accounts, dependencies.billing));
  app.route("/api/app/categories", createCategoryRoutes(dependencies.categories));
  app.route("/api/app/budgets", createBudgetRoutes(dependencies.budgets));
  app.route("/api/app/settings", createWorkspaceSettingsRoutes(dependencies.workspaceSettings));
  app.route("/api/app/onboarding", createOnboardingRoutes(dependencies.onboarding));
  app.route("/api/app/profile", createGoalProfileRoutes(dependencies.goalProfile));
  app.route("/api/app/pet", createPetRoutes(dependencies.pet));
  app.route("/api/app/billing", createBillingRoutes(dependencies.billing));
  app.route("/api/app/subscriptions", createSubscriptionRoutes(dependencies.subscriptions));
  app.route("/api/app/events", createCalendarEventRoutes(dependencies.events));
  app.route("/api/app/goals", createFinancialGoalRoutes(dependencies.goals));
  app.route("/api/app/debts", createDebtRoutes(dependencies.debts));
  app.route("/api/app/imports", createImportRoutes(dependencies.imports));
  app.route("/api/app/entry", createAiEntryRoutes(dependencies.aiEntryService));
  app.route("/api/app/sync", createMobileSyncRoutes(dependencies.mobileSync));
  app.route("/api/app/receipts", createReceiptRoutes(dependencies.receiptService));
  app.route(
    "/api/app/exports",
    createExportRoutes(dependencies.transactions, dependencies.billing),
  );

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((error, context) => {
    if (error instanceof HttpError) {
      return context.json(
        { error: error.code, message: error.message, details: error.details },
        error.status,
      );
    }
    console.error(
      JSON.stringify({
        message: "Request failed",
        category: "unexpected_error",
        method: context.req.method,
      }),
    );
    return context.json({ error: "internal_server_error" }, 500);
  });

  return app;
}
