import { dashboardQuerySchema, type DashboardSummary } from "@budget/shared";
import { Hono } from "hono";

import { categoryRepository, type CategoryRepository } from "./db/categories";
import { accountRepository, type AccountRepository } from "./db/accounts";
import { budgetRepository, type BudgetRepository } from "./db/budgets";
import { loadDashboard } from "./db/dashboard";
import { importRepository, type ImportRepository } from "./db/imports";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { HttpError } from "./errors";
import { d1RateLimiter, type RateLimiter } from "./rate-limit";
import { createCategoryRoutes } from "./routes/categories";
import { createAccountRoutes } from "./routes/accounts";
import { createBudgetRoutes } from "./routes/budgets";
import { createExportRoutes } from "./routes/exports";
import { createImportRoutes } from "./routes/imports";
import { createTransactionRoutes } from "./routes/transactions";
import type { Bindings } from "./types";

type DashboardLoader = (
  env: Bindings,
  period: { from: string; to: string },
) => Promise<DashboardSummary>;

interface AppOptions {
  dashboardLoader?: DashboardLoader;
  readinessCheck?: (env: Bindings) => Promise<void>;
  transactions?: TransactionRepository;
  categories?: CategoryRepository;
  accounts?: AccountRepository;
  budgets?: BudgetRepository;
  imports?: ImportRepository;
  rateLimiter?: RateLimiter;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: Bindings }>();
  const dashboardLoader = options.dashboardLoader ?? loadDashboard;
  const transactionStore = options.transactions ?? transactionRepository;
  const categoryStore = options.categories ?? categoryRepository;
  const accountStore = options.accounts ?? accountRepository;
  const budgetStore = options.budgets ?? budgetRepository;
  const importStore = options.imports ?? importRepository;
  const rateLimiter = options.rateLimiter ?? d1RateLimiter;
  const readinessCheck =
    options.readinessCheck ??
    (async (env: Bindings) => {
      await env.DB.prepare("SELECT 1").first();
    });

  app.use("/api/*", async (context, next) => {
    const allowedOrigins = (context.env?.ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((allowedOrigin) => allowedOrigin.trim());
    const requestOrigin = context.req.header("Origin");

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return context.json({ error: "origin_not_allowed" }, 403);
    }

    if (requestOrigin) {
      context.header("Access-Control-Allow-Origin", requestOrigin);
      context.header("Vary", "Origin");
    }
    context.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    context.header("Access-Control-Allow-Headers", "Content-Type");
    context.header("Access-Control-Max-Age", "86400");

    if (context.req.method === "OPTIONS") return context.body(null, 204);
    await next();
  });

  app.use("/api/*", async (context, next) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(context.req.method)) {
      await next();
      return;
    }
    if (!context.env?.DB && !options.rateLimiter) {
      await next();
      return;
    }

    const isImport = context.req.path.startsWith("/api/imports");
    const policy = isImport
      ? { scope: "demo-import", limit: 20, windowSeconds: 15 * 60 }
      : { scope: "demo-write", limit: 60, windowSeconds: 60 };
    const forwarded =
      context.req.header("CF-Connecting-IP") ?? context.req.header("X-Forwarded-For");
    const clientIdentifier = forwarded?.split(",")[0]?.trim() || "anonymous";
    const decision = await rateLimiter.consume(context.env, clientIdentifier, policy);

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

  app.get("/api/dashboard", async (context) => {
    const parsed = dashboardQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
        400,
      );
    }
    return context.json(await dashboardLoader(context.env, parsed.data));
  });

  app.route("/api/transactions", createTransactionRoutes(transactionStore));
  app.route("/api/accounts", createAccountRoutes(accountStore));
  app.route("/api/categories", createCategoryRoutes(categoryStore));
  app.route("/api/budgets", createBudgetRoutes(budgetStore));
  app.route("/api/imports", createImportRoutes(importStore));
  app.route("/api/exports", createExportRoutes(transactionStore));

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  app.onError((error, context) => {
    if (error instanceof HttpError) {
      return context.json(
        { error: error.code, message: error.message, details: error.details },
        error.status,
      );
    }
    console.error("Request failed", { name: error.name, message: error.message });
    return context.json({ error: "internal_server_error" }, 500);
  });

  return app;
}
