import { dashboardQuerySchema, type DashboardSummary } from "@budget/shared";
import { Hono } from "hono";

import { createAuthMiddleware, supabaseAuthVerifier, type AuthVerifier } from "./auth";
import { accountRepository, type AccountRepository } from "./db/accounts";
import { budgetRepository, type BudgetRepository } from "./db/budgets";
import { categoryRepository, type CategoryRepository } from "./db/categories";
import { loadDashboard } from "./db/dashboard";
import { importRepository, type ImportRepository } from "./db/imports";
import { DEMO_TENANT_ID } from "./db/scope";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { HttpError } from "./errors";
import { d1RateLimiter, type RateLimiter } from "./rate-limit";
import { createAccountRoutes } from "./routes/accounts";
import { createBudgetRoutes } from "./routes/budgets";
import { createCategoryRoutes } from "./routes/categories";
import { createExportRoutes } from "./routes/exports";
import { createImportRoutes } from "./routes/imports";
import { createTransactionRoutes } from "./routes/transactions";
import type { AppEnvironment, Bindings } from "./types";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

type DashboardLoader = (
  env: Bindings,
  tenantId: string,
  period: { from: string; to: string },
) => Promise<DashboardSummary>;

export interface AppOptions {
  dashboardLoader?: DashboardLoader;
  readinessCheck?: (env: Bindings) => Promise<void>;
  transactions?: TransactionRepository;
  categories?: CategoryRepository;
  accounts?: AccountRepository;
  budgets?: BudgetRepository;
  imports?: ImportRepository;
  rateLimiter?: RateLimiter;
  authVerifier?: AuthVerifier;
  tenantResolver?: TenantResolver;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnvironment>();
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const transactionStore = options.transactions ?? transactionRepository;
  const categoryStore = options.categories ?? categoryRepository;
  const accountStore = options.accounts ?? accountRepository;
  const budgetStore = options.budgets ?? budgetRepository;
  const importStore = options.imports ?? importRepository;
  const rateLimiter = options.rateLimiter ?? d1RateLimiter;
  const authVerifier = options.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = options.tenantResolver ?? tenantResolver;
  const readinessCheck =
    options.readinessCheck ??
    (async (env: Bindings) => {
      await env.DB.prepare("SELECT 1").first();
    });

  app.use("/api/*", async (context, next) => {
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
  app.use("/api/app/*", createAuthMiddleware(authVerifier, resolveTenant));
  app.use("/api/app/*", async (context, next) => {
    if (!WRITE_METHODS.has(context.req.method)) {
      await next();
      return;
    }

    const tenantId = context.get("tenant").tenantId;
    const isImport = context.req.path.startsWith("/api/app/imports");
    const policy = isImport
      ? { scope: "tenant-import", limit: 20, windowSeconds: 15 * 60 }
      : { scope: "tenant-write", limit: 60, windowSeconds: 60 };
    const decision = await rateLimiter.consume(context.env, tenantId, policy);

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

  app.get("/health", async (context) => {
    await readinessCheck(context.env);
    return context.json({ status: "ok", service: "budget-expense-api" });
  });

  app.get("/api/demo/dashboard", async (context) => {
    const parsed = dashboardQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Choose a valid dashboard date range.",
        parsed.error.flatten(),
      );
    }
    return context.json(await dashboardLoader(context.env, DEMO_TENANT_ID, parsed.data));
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

  app.route("/api/app/transactions", createTransactionRoutes(transactionStore));
  app.route("/api/app/accounts", createAccountRoutes(accountStore));
  app.route("/api/app/categories", createCategoryRoutes(categoryStore));
  app.route("/api/app/budgets", createBudgetRoutes(budgetStore));
  app.route("/api/app/imports", createImportRoutes(importStore));
  app.route("/api/app/exports", createExportRoutes(transactionStore));

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
