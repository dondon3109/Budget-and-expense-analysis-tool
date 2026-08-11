import {
  cashflowTrendQuerySchema,
  dashboardQuerySchema,
  type CashflowTrend,
  type CashflowTrendQuery,
  type DashboardSummary,
  type TransferFeeInsight,
} from "@zoption/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createAssistantOrchestrator } from "./assistant/orchestrator";
import { deepSeekProvider } from "./assistant/deepseek";
import { createFinancialReader } from "./assistant/financial-reader";
import type { AssistantAiTelemetryFactory } from "./assistant/posthog-ai";
import type { AssistantProvider } from "./assistant/provider";
import { createAssistantService, type AssistantService } from "./assistant/service";
import { createAccountDeletionService, type AccountDeletionService } from "./account-deletion";
import { createAuthMiddleware, supabaseAuthVerifier, type AuthVerifier } from "./auth";
import { accountRepository, type AccountRepository } from "./db/accounts";
import { assistantRepository, type AssistantRepository } from "./db/assistant";
import {
  assistantModelMemoryUsageRepository,
  type AssistantModelMemoryUsageRepository,
} from "./db/assistant-model-memory-usage";
import { assistantUsageRepository, type AssistantUsageRepository } from "./db/assistant-usage";
import { billingRepository, type BillingRepository } from "./db/billing";
import { budgetRepository, type BudgetRepository } from "./db/budgets";
import { categoryRepository, type CategoryRepository } from "./db/categories";
import { loadCashflowTrend, loadDashboard, loadTransferFeeInsight } from "./db/dashboard";
import { debtRepository, type DebtRepository } from "./db/debts";
import { calendarEventRepository, type CalendarEventRepository } from "./db/events";
import { financialGoalRepository, type FinancialGoalRepository } from "./db/goals";
import { createImportRepository, type ImportRepository } from "./db/imports";
import { platformAdminRepository, type PlatformAdminRepository } from "./db/platform-admin";
import { subscriptionRepository, type SubscriptionRepository } from "./db/subscriptions";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { HttpError } from "./errors";
import { d1RateLimiter, type RateLimiter } from "./rate-limit";
import { checkApiReadiness } from "./readiness";
import { createPlatformAdminService, type PlatformAdminService } from "./platform-admin";
import { createAccountDeletionRoutes } from "./routes/account-deletion";
import { createAccountRoutes } from "./routes/accounts";
import { createAssistantRoutes } from "./routes/assistant";
import { createBillingRoutes } from "./routes/billing";
import { createBudgetRoutes } from "./routes/budgets";
import { createCategoryRoutes } from "./routes/categories";
import { createDebtRoutes } from "./routes/debts";
import { createCalendarEventRoutes } from "./routes/events";
import { createExportRoutes } from "./routes/exports";
import { createFinancialGoalRoutes } from "./routes/goals";
import { createImportRoutes } from "./routes/imports";
import { createPayPalWebhookRoutes } from "./routes/paypal-webhooks";
import { createIdentityRoutes, createPlatformAdminRoutes } from "./routes/platform-admin";
import { createSubscriptionRoutes } from "./routes/subscriptions";
import { createSupportRoutes } from "./routes/support";
import { createTransactionRoutes } from "./routes/transactions";
import type { AppEnvironment, Bindings } from "./types";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_JSON_BODY_LIMIT = 64 * 1024;
const IMPORT_PREVIEW_BODY_LIMIT = 3 * 1024 * 1024;
const PAYPAL_WEBHOOK_BODY_LIMIT = 128 * 1024;
const PAYPAL_WEBHOOK_RATE_LIMIT = {
  scope: "paypal-webhook",
  limit: 60,
  windowSeconds: 60,
} as const;
const SUPPORT_CHAT_BODY_LIMIT = 24 * 1024;
const SUPPORT_CHAT_RATE_LIMITS = [
  { scope: "public-support-minute", limit: 8, windowSeconds: 60 },
  { scope: "public-support-day", limit: 40, windowSeconds: 24 * 60 * 60 },
] as const;
const MISSING_PAYPAL_WEBHOOK_CLIENT = "missing-cf-connecting-ip";
const MISSING_SUPPORT_CLIENT = "missing-cf-connecting-ip";

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
  accountId?: string,
) => Promise<DashboardSummary>;

type CashflowTrendLoader = (
  env: Bindings,
  tenantId: string,
  query: CashflowTrendQuery,
) => Promise<CashflowTrend>;

type TransferFeeLoader = (
  env: Bindings,
  tenantId: string,
  referenceDate: string,
) => Promise<TransferFeeInsight>;

export interface AppOptions {
  dashboardLoader?: DashboardLoader;
  cashflowTrendLoader?: CashflowTrendLoader;
  transferFeeLoader?: TransferFeeLoader;
  readinessCheck?: (env: Bindings) => Promise<void>;
  transactions?: TransactionRepository;
  categories?: CategoryRepository;
  accounts?: AccountRepository;
  budgets?: BudgetRepository;
  billing?: BillingRepository;
  subscriptions?: SubscriptionRepository;
  events?: CalendarEventRepository;
  goals?: FinancialGoalRepository;
  debts?: DebtRepository;
  imports?: ImportRepository;
  rateLimiter?: RateLimiter;
  authVerifier?: AuthVerifier;
  tenantResolver?: TenantResolver;
  assistantRepository?: AssistantRepository;
  assistantUsage?: AssistantUsageRepository;
  assistantModelMemoryUsage?: AssistantModelMemoryUsageRepository;
  assistantProvider?: AssistantProvider;
  supportProvider?: AssistantProvider;
  assistantTelemetryFactory?: AssistantAiTelemetryFactory;
  assistantService?: AssistantService;
  accountDeletionService?: AccountDeletionService;
  platformAdmins?: PlatformAdminRepository;
  platformAdminService?: PlatformAdminService;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnvironment>();
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const cashflowTrendLoader = options.cashflowTrendLoader ?? loadCashflowTrend;
  const transferFeeLoader = options.transferFeeLoader ?? loadTransferFeeInsight;
  const transactionStore = options.transactions ?? transactionRepository;
  const categoryStore = options.categories ?? categoryRepository;
  const accountStore = options.accounts ?? accountRepository;
  const budgetStore = options.budgets ?? budgetRepository;
  const billingStore = options.billing ?? billingRepository;
  const subscriptionStore = options.subscriptions ?? subscriptionRepository;
  const eventStore = options.events ?? calendarEventRepository;
  const goalStore = options.goals ?? financialGoalRepository;
  const debtStore = options.debts ?? debtRepository;
  const importStore = options.imports ?? createImportRepository(billingStore);
  const rateLimiter = options.rateLimiter ?? d1RateLimiter;
  const authVerifier = options.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = options.tenantResolver ?? tenantResolver;
  const assistantStore = options.assistantRepository ?? assistantRepository;
  const assistantUsage = options.assistantUsage ?? assistantUsageRepository;
  const assistantModelMemoryUsage =
    options.assistantModelMemoryUsage ?? assistantModelMemoryUsageRepository;
  const assistantProvider = options.assistantProvider ?? deepSeekProvider;
  const supportProvider = options.supportProvider ?? assistantProvider;
  const assistantService =
    options.assistantService ??
    createAssistantService(
      assistantStore,
      createAssistantOrchestrator(
        assistantProvider,
        createFinancialReader({
          accounts: accountStore,
          budgets: budgetStore,
          categories: categoryStore,
          transactions: transactionStore,
          goals: goalStore,
          debts: debtStore,
          dashboardLoader,
        }),
      ),
      undefined,
      assistantUsage,
      assistantProvider,
      assistantModelMemoryUsage,
      options.assistantTelemetryFactory,
    );
  const platformAdminStore = options.platformAdmins ?? platformAdminRepository;
  const platformAdminService =
    options.platformAdminService ?? createPlatformAdminService(platformAdminStore);
  const accountDeletionService =
    options.accountDeletionService ??
    createAccountDeletionService(undefined, undefined, billingStore, platformAdminStore);
  const readinessCheck = options.readinessCheck ?? checkApiReadiness;

  app.use("/api/*", async (context, next) => {
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Frame-Options", "DENY");
    if (new URL(context.req.url).protocol === "https:") {
      context.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    const allowedOrigins = (context.env?.ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((allowedOrigin) => allowedOrigin.trim())
      .filter(Boolean);
    const requestOrigin = context.req.header("Origin");

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return context.json({ error: "origin_not_allowed" }, 403);
    }

    if (requestOrigin) {
      context.header("Access-Control-Allow-Origin", requestOrigin);
      context.header("Vary", "Origin");
    }
    context.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    context.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    context.header("Access-Control-Max-Age", "86400");

    if (context.req.method === "OPTIONS") return context.body(null, 204);
    await next();
  });

  app.use("/api/app/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    await next();
  });

  app.use("/api/support/*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    if (context.req.method !== "POST") {
      await next();
      return;
    }
    if (!isJsonContentType(context.req.header("Content-Type"))) {
      throw new HttpError(
        415,
        "unsupported_media_type",
        "Send the request body as application/json.",
      );
    }
    const limitBody = bodyLimit({
      maxSize: SUPPORT_CHAT_BODY_LIMIT,
      onError: (limitedContext) =>
        limitedContext.json(
          { error: "payload_too_large", message: "The request body is too large." },
          413,
        ),
    }) as MiddlewareHandler<AppEnvironment>;
    // Hono narrows the wildcard route context more than its built-in middleware type.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return limitBody(context, next);
  });

  app.use("/api/support/*", async (context, next) => {
    if (context.req.method !== "POST") {
      await next();
      return;
    }
    const clientIdentifier =
      context.req.header("CF-Connecting-IP")?.trim() || MISSING_SUPPORT_CLIENT;
    for (const policy of SUPPORT_CHAT_RATE_LIMITS) {
      const decision = await rateLimiter.consume(context.env, clientIdentifier, policy);
      context.header("RateLimit-Limit", String(decision.limit));
      context.header("RateLimit-Remaining", String(decision.remaining));
      context.header("RateLimit-Reset", String(decision.retryAfterSeconds));
      if (!decision.allowed) {
        context.header("Retry-After", String(decision.retryAfterSeconds));
        return context.json(
          {
            error: "rate_limit_exceeded",
            message: `Too many support messages. Try again in ${decision.retryAfterSeconds} seconds.`,
          },
          429,
        );
      }
    }
    await next();
  });
  app.use(
    "/api/app/*",
    createAuthMiddleware(
      authVerifier,
      resolveTenant,
      (path, method) =>
        (method === "DELETE" && path === "/api/app/account") || path.startsWith("/api/app/admin/"),
    ),
  );
  app.use("/api/app/*", async (context, next) => {
    const requiresJson =
      JSON_METHODS.has(context.req.method) ||
      (context.req.method === "DELETE" && context.req.path === "/api/app/account");
    if (!requiresJson) {
      await next();
      return;
    }
    if (!isJsonContentType(context.req.header("Content-Type"))) {
      throw new HttpError(
        415,
        "unsupported_media_type",
        "Send the request body as application/json.",
      );
    }

    const maxSize =
      context.req.method === "POST" && context.req.path === "/api/app/imports/preview"
        ? IMPORT_PREVIEW_BODY_LIMIT
        : DEFAULT_JSON_BODY_LIMIT;
    const limitBody = bodyLimit({
      maxSize,
      onError: (limitedContext) =>
        limitedContext.json(
          { error: "payload_too_large", message: "The request body is too large." },
          413,
        ),
    }) as MiddlewareHandler<AppEnvironment>;
    // Hono narrows the wildcard route context more than its built-in middleware type.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return limitBody(context, next);
  });
  app.use("/api/app/*", async (context, next) => {
    const isAccountDeletion =
      context.req.method === "DELETE" && context.req.path === "/api/app/account";
    const isPlatformAdminRoute = context.req.path.startsWith("/api/app/admin/");
    const isAssistantGeneration =
      context.req.method === "POST" &&
      (context.req.path === "/api/app/assistant/threads" ||
        /^\/api\/app\/assistant\/threads\/[^/]+\/messages$/.test(context.req.path));
    const isExportRead =
      context.req.method === "GET" && context.req.path.startsWith("/api/app/exports");
    const isAssistantHistoryRead =
      context.req.method === "GET" && context.req.path.startsWith("/api/app/assistant/threads");
    const policies = isAccountDeletion
      ? [{ scope: "user-account-deletion", limit: 5, windowSeconds: 15 * 60 }]
      : isPlatformAdminRoute && WRITE_METHODS.has(context.req.method)
        ? [{ scope: "platform-admin-seat-write", limit: 20, windowSeconds: 15 * 60 }]
        : isPlatformAdminRoute
          ? [{ scope: "platform-admin-seat-read", limit: 60, windowSeconds: 60 }]
          : isAssistantGeneration
            ? [
                { scope: "tenant-assistant-minute", limit: 10, windowSeconds: 60 },
                { scope: "tenant-assistant-day", limit: 100, windowSeconds: 24 * 60 * 60 },
              ]
            : isExportRead
              ? [{ scope: "tenant-export-read", limit: 20, windowSeconds: 60 }]
              : isAssistantHistoryRead
                ? [{ scope: "tenant-assistant-read", limit: 60, windowSeconds: 60 }]
                : WRITE_METHODS.has(context.req.method)
                  ? [
                      context.req.path.startsWith("/api/app/imports")
                        ? { scope: "tenant-import", limit: 20, windowSeconds: 15 * 60 }
                        : { scope: "tenant-write", limit: 60, windowSeconds: 60 },
                    ]
                  : context.req.method === "GET"
                    ? [{ scope: "tenant-read", limit: 120, windowSeconds: 60 }]
                    : [];

    if (policies.length === 0) {
      await next();
      return;
    }

    const rateLimitIdentity =
      isAccountDeletion || isPlatformAdminRoute
        ? context.get("authUser").id
        : context.get("tenant").tenantId;

    for (const policy of policies) {
      const decision = await rateLimiter.consume(context.env, rateLimitIdentity, policy);
      context.header("RateLimit-Limit", String(decision.limit));
      context.header("RateLimit-Remaining", String(decision.remaining));
      context.header("RateLimit-Reset", String(decision.retryAfterSeconds));
      if (!decision.allowed) {
        context.header("Retry-After", String(decision.retryAfterSeconds));
        return context.json(
          {
            error: "rate_limit_exceeded",
            message: `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`,
          },
          429,
        );
      }
    }

    await next();
  });

  app.get("/health", async (context) => {
    try {
      await readinessCheck(context.env);
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

  app.get("/api/app/dashboard", async (context) => {
    const parsed = dashboardQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid dashboard date range.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await dashboardLoader(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  app.get("/api/app/dashboard/cashflow-trend", async (context) => {
    const parsed = cashflowTrendQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid cashflow trend view.",
        parsed.error.flatten(),
      );
    }
    if (parsed.data.view !== "weekly") {
      await billingStore.requirePro(
        context.env,
        context.get("tenant").tenantId,
        "cashflow_analytics",
      );
    }
    return context.json(
      await cashflowTrendLoader(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  app.get("/api/app/dashboard/transfer-fees", async (context) => {
    const referenceDate = new Date().toISOString().slice(0, 10);
    return context.json(
      await transferFeeLoader(context.env, context.get("tenant").tenantId, referenceDate),
    );
  });

  app.use("/api/billing/paypal/webhook", async (context, next) => {
    if (context.req.method !== "POST") {
      await next();
      return;
    }

    const clientIdentifier =
      context.req.header("CF-Connecting-IP")?.trim() || MISSING_PAYPAL_WEBHOOK_CLIENT;
    const decision = await rateLimiter.consume(
      context.env,
      clientIdentifier,
      PAYPAL_WEBHOOK_RATE_LIMIT,
    );
    context.header("RateLimit-Limit", String(decision.limit));
    context.header("RateLimit-Remaining", String(decision.remaining));
    context.header("RateLimit-Reset", String(decision.retryAfterSeconds));
    if (!decision.allowed) {
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json(
        {
          error: "rate_limit_exceeded",
          message: `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`,
        },
        429,
      );
    }

    await next();
  });
  app.use(
    "/api/billing/paypal/webhook",
    bodyLimit({
      maxSize: PAYPAL_WEBHOOK_BODY_LIMIT,
      onError: (limitedContext) =>
        limitedContext.json(
          { error: "payload_too_large", message: "The request body is too large." },
          413,
        ),
    }) as MiddlewareHandler<AppEnvironment>,
  );
  app.route("/api/billing/paypal/webhook", createPayPalWebhookRoutes(billingStore));
  app.route("/api/support", createSupportRoutes(supportProvider));
  app.route("/api/app/account", createAccountDeletionRoutes(accountDeletionService));
  app.route("/api/app/identity", createIdentityRoutes(platformAdminService));
  app.route("/api/app/admin", createPlatformAdminRoutes(platformAdminService));
  app.route("/api/app/assistant", createAssistantRoutes(assistantService));
  app.route("/api/app/transactions", createTransactionRoutes(transactionStore));
  app.route("/api/app/accounts", createAccountRoutes(accountStore, billingStore));
  app.route("/api/app/categories", createCategoryRoutes(categoryStore));
  app.route("/api/app/budgets", createBudgetRoutes(budgetStore));
  app.route("/api/app/billing", createBillingRoutes(billingStore));
  app.route("/api/app/subscriptions", createSubscriptionRoutes(subscriptionStore));
  app.route("/api/app/events", createCalendarEventRoutes(eventStore));
  app.route("/api/app/goals", createFinancialGoalRoutes(goalStore));
  app.route("/api/app/debts", createDebtRoutes(debtStore));
  app.route("/api/app/imports", createImportRoutes(importStore));
  app.route("/api/app/exports", createExportRoutes(transactionStore, billingStore));

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((error, context) => {
    if (error instanceof HttpError) {
      return context.json(
        { error: error.code, message: error.message, details: error.details },
        error.status,
      );
    }
    console.error(
      JSON.stringify({ message: "Request failed", name: error.name, error: error.message }),
    );
    return context.json({ error: "internal_server_error" }, 500);
  });

  return app;
}
