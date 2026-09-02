import {
  cashflowTrendQuerySchema,
  dashboardQuerySchema,
  type CashflowTrend,
  type CashflowTrendQuery,
  type DashboardSummary,
  type TransferFeeInsight,
} from "@zoption/shared";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { createAssistantOrchestrator } from "./assistant/orchestrator";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { deepSeekProvider } from "./assistant/deepseek";
import { createFinancialReader } from "./assistant/financial-reader";
import type { AssistantAiTelemetryFactory } from "./assistant/posthog-ai";
import type { AssistantProvider } from "./assistant/provider";
import { createAssistantService, type AssistantService } from "./assistant/service";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cloudflareWhisperProvider } from "./assistant/cloudflare-whisper";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { fishAudioProvider } from "./assistant/fish-audio";
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
import { assistantUsageRepository, type AssistantUsageRepository } from "./db/assistant-usage";
import { billingRepository, type BillingRepository } from "./db/billing";
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
import { subscriptionRepository, type SubscriptionRepository } from "./db/subscriptions";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import { createAiEntryService, type AiEntryService } from "./entry/ai-entry-service";
import { HttpError } from "./errors";
import { d1RateLimiter, type RateLimitPolicy, type RateLimiter } from "./rate-limit";
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
import { createIdentityRoutes, createPlatformAdminRoutes } from "./routes/platform-admin";
import { createSubscriptionRoutes } from "./routes/subscriptions";
import {
  createAuthenticatedSupportRoutes,
  createBugReportAdminRoutes,
  createSupportRoutes,
} from "./routes/support";
import { createBugReportService, type BugReportService } from "./support/bug-reports";
import { createTransactionRoutes } from "./routes/transactions";
import type { AppEnvironment, Bindings } from "./types";

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const JSON_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_JSON_BODY_LIMIT = 64 * 1024;
const IMPORT_PREVIEW_BODY_LIMIT = 3 * 1024 * 1024;
const ASSISTANT_VOICE_BODY_LIMIT = 4 * 1024 * 1024 + 64 * 1024;
const RECEIPT_IMAGE_BODY_LIMIT = 8 * 1024 * 1024 + 64 * 1024;
const AI_ENTRY_PDF_BODY_LIMIT = 5 * 1024 * 1024 + 64 * 1024;
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
  mobileSync?: MobileSyncRepository;
  rateLimiter?: RateLimiter;
  authVerifier?: AuthVerifier;
  tenantResolver?: TenantResolver;
  assistantRepository?: AssistantRepository;
  assistantVoiceRepository?: AssistantVoiceRepository;
  assistantUsage?: AssistantUsageRepository;
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
  customerReviews?: CustomerReviewRepository;
}

/**
 * Consume every rate limit policy in parallel and apply the standard headers.
 * Returns a 429 response when any policy rejects, otherwise null. On success the
 * headers reflect the last policy; on rejection they reflect the rejecting policy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono's middleware narrows the context input type beyond what a shared helper can express.
async function enforceRateLimits<Path extends string, Input extends Record<string, unknown> = any>(
  context: Context<AppEnvironment, Path, Input>,
  rateLimiter: RateLimiter,
  identity: string,
  policies: RateLimitPolicy[],
  tooManyMessage: (retryAfterSeconds: number) => string,
): Promise<Response | null> {
  const decisions = await Promise.all(
    policies.map((policy) => rateLimiter.consume(context.env, identity, policy)),
  );
  const rejected = decisions.find((decision) => !decision.allowed);
  const applied = rejected ?? decisions[decisions.length - 1]!;
  const isWebSocket = context.req.header("Upgrade")?.toLowerCase() === "websocket";
  if (!isWebSocket) {
    context.header("RateLimit-Limit", String(applied.limit));
    context.header("RateLimit-Remaining", String(applied.remaining));
    context.header("RateLimit-Reset", String(applied.retryAfterSeconds));
  }
  if (rejected) {
    if (!isWebSocket) context.header("Retry-After", String(rejected.retryAfterSeconds));
    return context.json(
      { error: "rate_limit_exceeded", message: tooManyMessage(rejected.retryAfterSeconds) },
      429,
    );
  }
  return null;
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
  const rateLimiter = options.rateLimiter ?? d1RateLimiter;
  const authVerifier = options.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = options.tenantResolver ?? tenantResolver;
  const assistantStore = options.assistantRepository ?? assistantRepository;
  const assistantUsage = options.assistantUsage ?? assistantUsageRepository;
  const assistantModelMemoryUsage =
    options.assistantModelMemoryUsage ?? assistantModelMemoryUsageRepository;
  // Dynamic provider that resolves the active DB config on every request (with 30s cache).
  // Falls back to env-based deepSeekProvider when DB is unavailable or before migration.
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
      assistantUsage,
      assistantProvider,
      assistantModelMemoryUsage,
      options.assistantTelemetryFactory,
    );
  const dynamicVoiceProviders: AssistantVoiceProviders =
    options.assistantVoiceProviders ??
    ({
      transcription: {
        async transcribe(env, audio) {
          const { providers } = await providerRegistry.getVoiceProviders(env);
          return providers.transcription.transcribe(env, audio);
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
    options.aiEntryService ?? createAiEntryService(receiptRepository, importStore);
  const platformAdminStore = options.platformAdmins ?? platformAdminRepository;
  const platformAdminService =
    options.platformAdminService ?? createPlatformAdminService(platformAdminStore);
  const bugReportService =
    options.bugReportService ?? createBugReportService(options.bugReports ?? bugReportRepository);
  const customerReviews = options.customerReviews ?? customerReviewRepository;
  const accountDeletionService =
    options.accountDeletionService ??
    createAccountDeletionService(undefined, undefined, billingStore, platformAdminStore);
  const readinessCheck = options.readinessCheck ?? checkApiReadiness;

  app.use("/api/*", async (context, next) => {
    const isWebSocket = context.req.header("Upgrade")?.toLowerCase() === "websocket";

    const allowedOrigins = (context.env?.ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((allowedOrigin) => allowedOrigin.trim())
      .filter(Boolean);
    const requestOrigin = context.req.header("Origin");

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      return context.json({ error: "origin_not_allowed" }, 403);
    }

    // Do not attach extra headers on WebSocket upgrades. Hono/Workers can clone
    // the 101 response when headers are merged, which aborts the browser handshake.
    if (isWebSocket) {
      await next();
      return;
    }

    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Frame-Options", "DENY");
    if (new URL(context.req.url).protocol === "https:") {
      context.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
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
    if (context.req.header("Upgrade")?.toLowerCase() === "websocket") {
      await next();
      return;
    }
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
    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      clientIdentifier,
      [...SUPPORT_CHAT_RATE_LIMITS],
      (seconds) => `Too many support messages. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;
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
    const multipartRoute =
      context.req.method === "POST" &&
      {
        "/api/app/assistant/voice/transcriptions": {
          maxSize: ASSISTANT_VOICE_BODY_LIMIT,
          typeMessage: "Send voice recordings as multipart form data.",
          sizeMessage: "The voice recording is too large.",
        },
        "/api/app/receipts/extract": {
          maxSize: RECEIPT_IMAGE_BODY_LIMIT,
          typeMessage: "Send the receipt photo as multipart form data.",
          sizeMessage: "The receipt photo is too large.",
        },
        "/api/app/entry/voice": {
          maxSize: ASSISTANT_VOICE_BODY_LIMIT,
          typeMessage: "Send voice recordings as multipart form data.",
          sizeMessage: "The voice recording is too large.",
        },
        "/api/app/entry/pdf-preview": {
          maxSize: AI_ENTRY_PDF_BODY_LIMIT,
          typeMessage: "Send the statement PDF as multipart form data.",
          sizeMessage: "The statement PDF is too large.",
        },
      }[context.req.path];
    if (multipartRoute) {
      const contentType = context.req.header("Content-Type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("multipart/form-data;")) {
        throw new HttpError(415, "unsupported_media_type", multipartRoute.typeMessage);
      }
      const limitBody = bodyLimit({
        maxSize: multipartRoute.maxSize,
        onError: (limitedContext) =>
          limitedContext.json(
            { error: "payload_too_large", message: multipartRoute.sizeMessage },
            413,
          ),
      }) as MiddlewareHandler<AppEnvironment>;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return limitBody(context, next);
    }
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
    const isSupportGeneration =
      context.req.method === "POST" && context.req.path === "/api/app/support/chat";
    const isVoiceTranscription =
      context.req.method === "POST" &&
      context.req.path === "/api/app/assistant/voice/transcriptions";
    const isVoiceSpeech =
      context.req.method === "POST" &&
      (context.req.path === "/api/app/assistant/voice/speech" ||
        context.req.path === "/api/app/assistant/voice/preview");
    const isReceiptExtraction =
      context.req.method === "POST" && context.req.path === "/api/app/receipts/extract";
    const isAiEntryVoice =
      context.req.method === "POST" && context.req.path === "/api/app/entry/voice";
    const isAiEntryPdf =
      context.req.method === "POST" && context.req.path === "/api/app/entry/pdf-preview";
    const isExportRead =
      context.req.method === "GET" && context.req.path.startsWith("/api/app/exports");
    const isAssistantHistoryRead =
      context.req.method === "GET" && context.req.path.startsWith("/api/app/assistant/threads");
    const policies = isVoiceTranscription
      ? [
          { scope: "tenant-assistant-voice-transcription-minute", limit: 6, windowSeconds: 60 },
          { scope: "tenant-assistant-voice-transcription-day", limit: 30, windowSeconds: 86_400 },
        ]
      : isVoiceSpeech
        ? [
            { scope: "tenant-assistant-voice-speech-minute", limit: 12, windowSeconds: 60 },
            { scope: "tenant-assistant-voice-speech-day", limit: 60, windowSeconds: 86_400 },
          ]
        : isReceiptExtraction
          ? [
              { scope: "tenant-receipt-extraction-minute", limit: 6, windowSeconds: 60 },
              { scope: "tenant-receipt-extraction-day", limit: 60, windowSeconds: 86_400 },
            ]
          : isAiEntryVoice
            ? [
                { scope: "tenant-entry-voice-minute", limit: 6, windowSeconds: 60 },
                { scope: "tenant-entry-voice-day", limit: 30, windowSeconds: 86_400 },
              ]
            : isAiEntryPdf
              ? [
                  { scope: "tenant-entry-pdf-minute", limit: 3, windowSeconds: 60 },
                  { scope: "tenant-entry-pdf-day", limit: 20, windowSeconds: 86_400 },
                ]
              : isAccountDeletion
                ? [{ scope: "user-account-deletion", limit: 5, windowSeconds: 15 * 60 }]
                : isPlatformAdminRoute && WRITE_METHODS.has(context.req.method)
                  ? [{ scope: "platform-admin-seat-write", limit: 20, windowSeconds: 15 * 60 }]
                  : isPlatformAdminRoute
                    ? [{ scope: "platform-admin-seat-read", limit: 60, windowSeconds: 60 }]
                    : isAssistantGeneration || isSupportGeneration
                      ? [
                          {
                            scope: isSupportGeneration
                              ? "tenant-support-minute"
                              : "tenant-assistant-minute",
                            limit: 10,
                            windowSeconds: 60,
                          },
                          {
                            scope: isSupportGeneration
                              ? "tenant-support-day"
                              : "tenant-assistant-day",
                            limit: 100,
                            windowSeconds: 24 * 60 * 60,
                          },
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

    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      rateLimitIdentity,
      policies,
      (seconds) => `Too many requests. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;

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
    const limited = await enforceRateLimits(
      context,
      rateLimiter,
      clientIdentifier,
      [PAYPAL_WEBHOOK_RATE_LIMIT],
      (seconds) => `Too many webhook deliveries. Try again in ${seconds} seconds.`,
    );
    if (limited) return limited;

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
  app.route("/api/reviews", createPublicCustomerReviewRoutes(customerReviews));
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
  app.route("/api/app/identity", createIdentityRoutes(platformAdminService));
  app.route("/api/app/admin", createPlatformAdminRoutes(platformAdminService));
  app.route("/api/app/admin/provider-configs", createAdminProviderConfigRoutes(platformAdminService));
  app.route("/api/app/admin/provider-credentials", createProviderCredentialRoutes(platformAdminService));
  app.route("/api/app/assistant/voice", createAssistantVoiceRoutes(assistantVoiceService));
  app.route("/api/app/assistant/voice", createVoiceStreamRoutes());
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
