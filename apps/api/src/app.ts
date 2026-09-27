import type { redactBugReport } from "@zoption/shared";
import { Hono } from "hono";

import { createAssistantOrchestrator } from "./assistant/orchestrator";
import { createFinancialReader } from "./assistant/financial-reader";
import type { AssistantAiTelemetryFactory } from "./assistant/posthog-ai";
import type { AssistantProvider } from "./assistant/provider";
import { createAssistantService, type AssistantService } from "./assistant/service";
import { createAssistantVoiceService, type AssistantVoiceService } from "./assistant/voice-service";
import type { AssistantVoiceProviders } from "./assistant/voice-provider";
import { providerRegistry } from "./provider-registry";
import { createAdminProviderConfigRoutes } from "./routes/admin-provider-configs";
import { createProviderCredentialRoutes } from "./routes/provider-credentials";
import { createVoiceStreamRoutes } from "./routes/voice-stream";
import { createAccountDeletionService, type AccountDeletionService } from "./account-deletion";
import { createAuthMiddleware, supabaseAuthVerifier, type AuthVerifier } from "./auth";
import { accountRepository, type AccountRepository } from "./db/accounts";
import {
  assistantRepository,
  type AssistantRepository,
  type AssistantVoiceRepository,
} from "./db/assistant";
import {
  assistantModelMemoryUsageRepository,
  type AssistantModelMemoryUsageRepository,
} from "./db/assistant-model-memory-usage";
import {
  billingRepository,
  consumeAiUsage as defaultConsumeAiUsage,
  type BillingRepository,
} from "./db/billing";
import { budgetRepository, type BudgetRepository } from "./db/budgets";
import { categoryRepository, type CategoryRepository } from "./db/categories";
import { customerReviewRepository, type CustomerReviewRepository } from "./db/customer-reviews";
import { loadCashflowTrend, loadDashboard, loadTransferFeeInsight } from "./db/dashboard";
import { debtRepository, type DebtRepository } from "./db/debts";
import { calendarEventRepository, type CalendarEventRepository } from "./db/events";
import { financialGoalRepository, type FinancialGoalRepository } from "./db/goals";
import { createImportRepository, type ImportRepository } from "./db/imports";
import { mobileSyncRepository, type MobileSyncRepository } from "./db/mobile-sync";
import { platformAdminRepository, type PlatformAdminRepository } from "./db/platform-admin";
import { bugReportRepository, type BugReportRepository } from "./db/bug-reports";
import {
  bugReportEgressAuditRepository,
  type BugReportEgressAuditRepository,
} from "./db/bug-report-egress-audit";
import { subscriptionRepository, type SubscriptionRepository } from "./db/subscriptions";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { createAiEntryService, type AiEntryService } from "./entry/ai-entry-service";
import { HttpError } from "./errors";
import {
  appBodyLimits,
  createBillingWebhookBodyLimit,
  supportBodyLimits,
} from "./http/body-limits";
import { corsAndSecurityHeaders } from "./http/cors";
import {
  createAppRateLimit,
  createBillingWebhookRateLimit,
  createSupportRateLimit,
} from "./http/rate-limit-policy";
import { servePublicAvatar } from "./avatars";
import { boundRateLimiter, type RateLimiter } from "./rate-limit";
import { createAvatarRoutes } from "./routes/avatars";
import { checkApiReadiness } from "./readiness";
import { createPlatformAdminService, type PlatformAdminService } from "./platform-admin";
import { createAccountDeletionRoutes } from "./routes/account-deletion";
import { createAccountRoutes } from "./routes/accounts";
import { createAssistantRoutes } from "./routes/assistant";
import { createAssistantVoiceRoutes } from "./routes/assistant-voice";
import { createBillingRoutes } from "./routes/billing";
import { createBudgetRoutes } from "./routes/budgets";
import { createCategoryRoutes } from "./routes/categories";
import {
  createAdminCustomerReviewRoutes,
  createAuthenticatedCustomerReviewRoutes,
  createPublicCustomerReviewRoutes,
} from "./routes/customer-reviews";
import {
  createDashboardRoutes,
  type CashflowTrendLoader,
  type DashboardLoader,
  type TransferFeeLoader,
} from "./routes/dashboard";
import { createDebtRoutes } from "./routes/debts";
import { createAiEntryRoutes } from "./routes/ai-entry";
import { createCalendarEventRoutes } from "./routes/events";
import { createExportRoutes } from "./routes/exports";
import { createFinancialGoalRoutes } from "./routes/goals";
import { createImportRoutes } from "./routes/imports";
import { createMobileSyncRoutes } from "./routes/mobile-sync";
import { createReceiptRoutes } from "./routes/receipts";
import { receiptRepository } from "./db/receipts";
import { cloudflareVisionProvider } from "./receipts/cloudflare-vision";
import { createReceiptService, type ReceiptService } from "./receipts/service";
import { createPayPalWebhookRoutes } from "./routes/paypal-webhooks";
import { createDodoWebhookRoutes } from "./routes/dodo-webhooks";
import { createIdentityRoutes, createPlatformAdminRoutes } from "./routes/platform-admin";
import { createSubscriptionRoutes } from "./routes/subscriptions";
import {
  createAuthenticatedSupportRoutes,
  createBugReportAdminRoutes,
  createSupportRoutes,
} from "./routes/support";
import { createBugReportService, type BugReportService } from "./support/bug-reports";
import { createBugReportEgressRoutes } from "./routes/ops-bug-report-egress";
import { createTransactionRoutes } from "./routes/transactions";
import type { AppEnvironment, Bindings } from "./types";

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
  mobileSync?: MobileSyncRepository;
  rateLimiter?: RateLimiter;
  authVerifier?: AuthVerifier;
  tenantResolver?: TenantResolver;
  assistantRepository?: AssistantRepository;
  assistantVoiceRepository?: AssistantVoiceRepository;
  consumeAiUsage?: (env: Bindings, tenantId: string) => Promise<void>;
  assistantModelMemoryUsage?: AssistantModelMemoryUsageRepository;
  assistantProvider?: AssistantProvider;
  supportProvider?: AssistantProvider;
  assistantTelemetryFactory?: AssistantAiTelemetryFactory;
  assistantService?: AssistantService;
  assistantVoiceProviders?: AssistantVoiceProviders;
  assistantVoiceService?: AssistantVoiceService;
  receiptService?: ReceiptService;
  aiEntryService?: AiEntryService;
  accountDeletionService?: AccountDeletionService;
  platformAdmins?: PlatformAdminRepository;
  platformAdminService?: PlatformAdminService;
  bugReports?: BugReportRepository;
  bugReportService?: BugReportService;
  bugReportEgressAudit?: BugReportEgressAuditRepository;
  bugReportEgressRedact?: typeof redactBugReport;
  customerReviews?: CustomerReviewRepository;
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
  const mobileSyncStore = options.mobileSync ?? mobileSyncRepository;
  const rateLimiter = options.rateLimiter ?? boundRateLimiter;
  const authVerifier = options.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = options.tenantResolver ?? tenantResolver;
  const assistantStore = options.assistantRepository ?? assistantRepository;
  const consumeAiUsage = options.consumeAiUsage ?? defaultConsumeAiUsage;
  const assistantModelMemoryUsage =
    options.assistantModelMemoryUsage ?? assistantModelMemoryUsageRepository;
  // Dynamic provider that resolves the active DB config on every request (with 30s cache).
  // Falls back to the env-configured provider when the DB is unavailable or before migration.
  const dynamicAssistantProvider: AssistantProvider =
    options.assistantProvider ??
    ({
      async complete(env, request) {
        const { provider } = await providerRegistry.getAssistantProvider(env);
        return provider.complete(env, request);
      },
    } satisfies AssistantProvider);
  const assistantProvider = dynamicAssistantProvider;
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
      consumeAiUsage,
      assistantProvider,
      assistantModelMemoryUsage,
      options.assistantTelemetryFactory,
    );
  const dynamicVoiceProviders: AssistantVoiceProviders =
    options.assistantVoiceProviders ??
    ({
      transcription: {
        async transcribe(env, audio, options) {
          const { providers } = await providerRegistry.getVoiceProviders(env);
          return providers.transcription.transcribe(env, audio, options);
        },
      },
      speech: {
        async synthesize(env, text, voice) {
          const { providers } = await providerRegistry.getVoiceProviders(env);
          return providers.speech.synthesize(env, text, voice);
        },
      },
    } satisfies AssistantVoiceProviders);
  const assistantVoiceService =
    options.assistantVoiceService ??
    createAssistantVoiceService(
      {
        getPreferences: assistantStore.getPreferences.bind(assistantStore),
        ...(options.assistantVoiceRepository ?? assistantRepository),
      },
      dynamicVoiceProviders,
      undefined,
      {
        getActiveSttModel: async (env) => {
          const cfg = await providerRegistry.getActive(env, "stt");
          return cfg?.model ?? "@cf/openai/whisper-large-v3-turbo";
        },
        getActiveTtsModel: async (env) => {
          const cfg = await providerRegistry.getActive(env, "tts");
          return cfg?.model ?? "s2.1-pro-free";
        },
      },
    );
  const receiptService =
    options.receiptService ?? createReceiptService(receiptRepository, cloudflareVisionProvider);
  const aiEntryService =
    options.aiEntryService ??
    createAiEntryService(receiptRepository, importStore, dynamicVoiceProviders.transcription);
  const platformAdminStore = options.platformAdmins ?? platformAdminRepository;
  const platformAdminService =
    options.platformAdminService ?? createPlatformAdminService(platformAdminStore);
  const bugReportStore = options.bugReports ?? bugReportRepository;
  const bugReportEgressAuditStore = options.bugReportEgressAudit ?? bugReportEgressAuditRepository;
  const bugReportService = options.bugReportService ?? createBugReportService(bugReportStore);
  const customerReviews = options.customerReviews ?? customerReviewRepository;
  const accountDeletionService =
    options.accountDeletionService ??
    createAccountDeletionService(undefined, undefined, billingStore, platformAdminStore);
  const readinessCheck = options.readinessCheck ?? checkApiReadiness;

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

  app.use("/api/support/*", createSupportRateLimit(rateLimiter));
  app.use(
    "/api/app/*",
    createAuthMiddleware(
      authVerifier,
      resolveTenant,
      (path, method) =>
        (method === "DELETE" && path === "/api/app/account") || path.startsWith("/api/app/admin/"),
    ),
  );
  app.use("/api/app/*", appBodyLimits);
  app.use("/api/app/*", createAppRateLimit(rateLimiter));

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

  app.route(
    "/api/app/dashboard",
    createDashboardRoutes(
      { dashboardLoader, cashflowTrendLoader, transferFeeLoader },
      billingStore,
    ),
  );

  for (const [provider, routes] of [
    ["paypal", createPayPalWebhookRoutes(billingStore)],
    ["dodo", createDodoWebhookRoutes(billingStore)],
  ] as const) {
    const path = `/api/billing/${provider}/webhook`;
    app.use(path, createBillingWebhookRateLimit(rateLimiter, provider));
    app.use(path, createBillingWebhookBodyLimit());
    app.route(path, routes);
  }
  app.route("/api/support", createSupportRoutes(supportProvider));
  app.route("/api/reviews", createPublicCustomerReviewRoutes(customerReviews));
  app.route(
    "/api/ops/bug-reports",
    createBugReportEgressRoutes(
      bugReportStore,
      bugReportEgressAuditStore,
      options.bugReportEgressRedact,
    ),
  );
  app.route(
    "/api/app/admin/reviews",
    createAdminCustomerReviewRoutes(customerReviews, platformAdminService),
  );
  app.route(
    "/api/app/admin/bug-reports",
    createBugReportAdminRoutes(bugReportService, platformAdminService),
  );
  app.route(
    "/api/app/support",
    createAuthenticatedSupportRoutes(supportProvider, bugReportService),
  );
  app.route("/api/app/account", createAccountDeletionRoutes(accountDeletionService));
  app.route("/api/app/profile/avatar", createAvatarRoutes());
  app.route("/api/app/identity", createIdentityRoutes(platformAdminService));
  app.route("/api/app/admin", createPlatformAdminRoutes(platformAdminService));
  app.route(
    "/api/app/admin/provider-configs",
    createAdminProviderConfigRoutes(platformAdminService),
  );
  app.route(
    "/api/app/admin/provider-credentials",
    createProviderCredentialRoutes(platformAdminService),
  );
  app.route("/api/app/assistant/voice", createAssistantVoiceRoutes(assistantVoiceService));
  app.route("/api/app/assistant/voice", createVoiceStreamRoutes(assistantVoiceService));
  app.route("/api/app/assistant", createAssistantRoutes(assistantService));
  app.route("/api/app/transactions", createTransactionRoutes(transactionStore));
  app.route("/api/app/reviews", createAuthenticatedCustomerReviewRoutes(customerReviews));
  app.route("/api/app/accounts", createAccountRoutes(accountStore, billingStore));
  app.route("/api/app/categories", createCategoryRoutes(categoryStore));
  app.route("/api/app/budgets", createBudgetRoutes(budgetStore));
  app.route("/api/app/billing", createBillingRoutes(billingStore));
  app.route("/api/app/subscriptions", createSubscriptionRoutes(subscriptionStore));
  app.route("/api/app/events", createCalendarEventRoutes(eventStore));
  app.route("/api/app/goals", createFinancialGoalRoutes(goalStore));
  app.route("/api/app/debts", createDebtRoutes(debtStore));
  app.route("/api/app/imports", createImportRoutes(importStore));
  app.route("/api/app/entry", createAiEntryRoutes(aiEntryService));
  app.route("/api/app/sync", createMobileSyncRoutes(mobileSyncStore));
  app.route("/api/app/receipts", createReceiptRoutes(receiptService));
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
