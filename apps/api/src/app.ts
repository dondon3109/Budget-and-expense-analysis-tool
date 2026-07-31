import {
  cashflowTrendQuerySchema,
  dashboardQuerySchema,
  type CashflowTrend,
  type CashflowTrendQuery,
  type DashboardSummary,
} from "@zoption/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createAssistantOrchestrator } from "./assistant/orchestrator";
import { deepSeekProvider } from "./assistant/deepseek";
import { createFinancialReader } from "./assistant/financial-reader";
import type { AssistantProvider } from "./assistant/provider";
import { createAssistantService, type AssistantService } from "./assistant/service";
import { createAccountDeletionService, type AccountDeletionService } from "./account-deletion";
import { createAuthMiddleware, supabaseAuthVerifier, type AuthVerifier } from "./auth";
import { accountRepository, type AccountRepository } from "./db/accounts";
import { assistantRepository, type AssistantRepository } from "./db/assistant";
import { billingRepository, type BillingRepository } from "./db/billing";
import { budgetRepository, type BudgetRepository } from "./db/budgets";
import { categoryRepository, type CategoryRepository } from "./db/categories";
import { loadCashflowTrend, loadDashboard } from "./db/dashboard";
import { calendarEventRepository, type CalendarEventRepository } from "./db/events";
import { createImportRepository, type ImportRepository } from "./db/imports";
import { subscriptionRepository, type SubscriptionRepository } from "./db/subscriptions";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { HttpError } from "./errors";
import { d1RateLimiter, type RateLimiter } from "./rate-limit";
import { createAccountDeletionRoutes } from "./routes/account-deletion";
import { createAccountRoutes } from "./routes/accounts";
import { createAssistantRoutes } from "./routes/assistant";
import { createBillingRoutes } from "./routes/billing";
import { createBudgetRoutes } from "./routes/budgets";
import { createCategoryRoutes } from "./routes/categories";
import { createCalendarEventRoutes } from "./routes/events";
import { createExportRoutes } from "./routes/exports";
import { createImportRoutes } from "./routes/imports";
import { createPaddleWebhookRoutes } from "./routes/paddle-webhooks";
import { createSubscriptionRoutes } from "./routes/subscriptions";
import { createTransactionRoutes } from "./routes/transactions";
import type { AppEnvironment, Bindings } from "./types";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_JSON_BODY_LIMIT = 64 * 1024;
const IMPORT_PREVIEW_BODY_LIMIT = 3 * 1024 * 1024;

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
) => Promise<DashboardSummary>;

type CashflowTrendLoader = (
  env: Bindings,
  tenantId: string,
  query: CashflowTrendQuery,
) => Promise<CashflowTrend>;

export interface AppOptions {
  dashboardLoader?: DashboardLoader;
  cashflowTrendLoader?: CashflowTrendLoader;
  readinessCheck?: (env: Bindings) => Promise<void>;
  transactions?: TransactionRepository;
  categories?: CategoryRepository;
  accounts?: AccountRepository;
  budgets?: BudgetRepository;
  billing?: BillingRepository;
  subscriptions?: SubscriptionRepository;
  events?: CalendarEventRepository;
  imports?: ImportRepository;
  rateLimiter?: RateLimiter;
  authVerifier?: AuthVerifier;
  tenantResolver?: TenantResolver;
  assistantRepository?: AssistantRepository;
  assistantProvider?: AssistantProvider;
  assistantService?: AssistantService;
  accountDeletionService?: AccountDeletionService;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnvironment>();
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const cashflowTrendLoader = options.cashflowTrendLoader ?? loadCashflowTrend;
  const transactionStore = options.transactions ?? transactionRepository;
  const categoryStore = options.categories ?? categoryRepository;
  const accountStore = options.accounts ?? accountRepository;
  const budgetStore = options.budgets ?? budgetRepository;
  const billingStore = options.billing ?? billingRepository;
  const subscriptionStore = options.subscriptions ?? subscriptionRepository;
  const eventStore = options.events ?? calendarEventRepository;
  const importStore = options.imports ?? createImportRepository(billingStore);
  const rateLimiter = options.rateLimiter ?? d1RateLimiter;
  const authVerifier = options.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = options.tenantResolver ?? tenantResolver;
  const assistantStore = options.assistantRepository ?? assistantRepository;
  const assistantProvider = options.assistantProvider ?? deepSeekProvider;
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
          dashboardLoader,
        }),
      ),
      undefined,
      billingStore,
    );
  const accountDeletionService =
    options.accountDeletionService ??
    createAccountDeletionService(undefined, undefined, billingStore);
  const readinessCheck =
    options.readinessCheck ??
    (async (env: Bindings) => {
      await env.DB.prepare("SELECT 1").first();
    });

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
  app.use(
    "/api/app/*",
    createAuthMiddleware(
      authVerifier,
      resolveTenant,
      (path, method) => method === "DELETE" && path === "/api/app/account",
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
              : [];

    if (policies.length === 0) {
      await next();
      return;
    }

    const rateLimitIdentity = isAccountDeletion
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
    await readinessCheck(context.env);
    return context.json({ status: "ok", service: "budget-expense-api" });
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

  app.route("/api/billing/paddle/webhook", createPaddleWebhookRoutes(billingStore));
  app.route("/api/app/account", createAccountDeletionRoutes(accountDeletionService));
  app.route("/api/app/assistant", createAssistantRoutes(assistantService));
  app.route("/api/app/transactions", createTransactionRoutes(transactionStore));
  app.route("/api/app/accounts", createAccountRoutes(accountStore, billingStore));
  app.route("/api/app/categories", createCategoryRoutes(categoryStore));
  app.route("/api/app/budgets", createBudgetRoutes(budgetStore));
  app.route("/api/app/billing", createBillingRoutes(billingStore));
  app.route("/api/app/subscriptions", createSubscriptionRoutes(subscriptionStore));
  app.route("/api/app/events", createCalendarEventRoutes(eventStore));
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
