import type { redactBugReport } from "@zoption/shared";

import { createAccountDeletionService, type AccountDeletionService } from "./account-deletion";
import { createFinancialReader } from "./assistant/financial-reader";
import { createAssistantOrchestrator } from "./assistant/orchestrator";
import type { AssistantAiTelemetryFactory } from "./assistant/posthog-ai";
import type { AssistantProvider } from "./assistant/provider";
import { createAssistantService, type AssistantService } from "./assistant/service";
import type { AssistantVoiceProviders } from "./assistant/voice-provider";
import { createAssistantVoiceService, type AssistantVoiceService } from "./assistant/voice-service";
import { supabaseAuthVerifier, type AuthVerifier } from "./auth";
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
import {
  bugReportEgressAuditRepository,
  type BugReportEgressAuditRepository,
} from "./db/bug-report-egress-audit";
import { bugReportRepository, type BugReportRepository } from "./db/bug-reports";
import { categoryRepository, type CategoryRepository } from "./db/categories";
import { customerReviewRepository, type CustomerReviewRepository } from "./db/customer-reviews";
import { loadCashflowTrend, loadDashboard, loadTransferFeeInsight } from "./db/dashboard";
import { debtRepository, type DebtRepository } from "./db/debts";
import { calendarEventRepository, type CalendarEventRepository } from "./db/events";
import { financialGoalRepository, type FinancialGoalRepository } from "./db/goals";
import { createImportRepository, type ImportRepository } from "./db/imports";
import { mobileSyncRepository, type MobileSyncRepository } from "./db/mobile-sync";
import { platformAdminRepository, type PlatformAdminRepository } from "./db/platform-admin";
import { receiptRepository } from "./db/receipts";
import { subscriptionRepository, type SubscriptionRepository } from "./db/subscriptions";
import { tenantResolver, type TenantResolver } from "./db/tenants";
import { transactionRepository, type TransactionRepository } from "./db/transactions";
import {
  workspaceSettingsRepository,
  type WorkspaceSettingsRepository,
} from "./db/workspace-settings";
import { onboardingRepository, type OnboardingRepository } from "./db/onboarding";
import { createAiEntryService, type AiEntryService } from "./entry/ai-entry-service";
import { createPlatformAdminService, type PlatformAdminService } from "./platform-admin";
import { providerRegistry } from "./provider-registry";
import { boundRateLimiter, type RateLimiter } from "./rate-limit";
import { checkApiReadiness } from "./readiness";
import { cloudflareVisionProvider } from "./receipts/cloudflare-vision";
import { createReceiptService, type ReceiptService } from "./receipts/service";
import type { CashflowTrendLoader, DashboardLoader, TransferFeeLoader } from "./routes/dashboard";
import { createBugReportService, type BugReportService } from "./support/bug-reports";
import type { Bindings } from "./types";

/** Each field replaces one default dependency. Tests pass fakes here; production passes none. */
export interface AppOptions {
  dashboardLoader?: DashboardLoader;
  cashflowTrendLoader?: CashflowTrendLoader;
  transferFeeLoader?: TransferFeeLoader;
  readinessCheck?: (env: Bindings) => Promise<void>;
  transactions?: TransactionRepository;
  categories?: CategoryRepository;
  accounts?: AccountRepository;
  budgets?: BudgetRepository;
  workspaceSettings?: WorkspaceSettingsRepository;
  onboarding?: OnboardingRepository;
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

/**
 * Composition root for `createApp`: resolves every repository, provider, and service the routes
 * use, replacing each default with the matching `overrides` field when one is given.
 */
export function createDependencies(overrides: AppOptions = {}) {
  const dashboardLoader = overrides.dashboardLoader ?? loadDashboard;
  const cashflowTrendLoader = overrides.cashflowTrendLoader ?? loadCashflowTrend;
  const transferFeeLoader = overrides.transferFeeLoader ?? loadTransferFeeInsight;
  const transactionStore = overrides.transactions ?? transactionRepository;
  const categoryStore = overrides.categories ?? categoryRepository;
  const accountStore = overrides.accounts ?? accountRepository;
  const budgetStore = overrides.budgets ?? budgetRepository;
  const workspaceSettingsStore = overrides.workspaceSettings ?? workspaceSettingsRepository;
  const onboardingStore = overrides.onboarding ?? onboardingRepository;
  const billingStore = overrides.billing ?? billingRepository;
  const subscriptionStore = overrides.subscriptions ?? subscriptionRepository;
  const eventStore = overrides.events ?? calendarEventRepository;
  const goalStore = overrides.goals ?? financialGoalRepository;
  const debtStore = overrides.debts ?? debtRepository;
  const importStore = overrides.imports ?? createImportRepository(billingStore);
  const mobileSyncStore = overrides.mobileSync ?? mobileSyncRepository;
  const rateLimiter = overrides.rateLimiter ?? boundRateLimiter;
  const authVerifier = overrides.authVerifier ?? supabaseAuthVerifier;
  const resolveTenant = overrides.tenantResolver ?? tenantResolver;
  const assistantStore = overrides.assistantRepository ?? assistantRepository;
  const consumeAiUsage = overrides.consumeAiUsage ?? defaultConsumeAiUsage;
  const assistantModelMemoryUsage =
    overrides.assistantModelMemoryUsage ?? assistantModelMemoryUsageRepository;
  // Dynamic provider that resolves the active DB config on every request (with 30s cache).
  // Falls back to the env-configured provider when the DB is unavailable or before migration.
  const assistantProvider: AssistantProvider =
    overrides.assistantProvider ??
    ({
      async complete(env, request) {
        const { provider } = await providerRegistry.getAssistantProvider(env);
        return provider.complete(env, request);
      },
    } satisfies AssistantProvider);
  const supportProvider = overrides.supportProvider ?? assistantProvider;
  const assistantService =
    overrides.assistantService ??
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
      overrides.assistantTelemetryFactory,
    );
  const dynamicVoiceProviders: AssistantVoiceProviders =
    overrides.assistantVoiceProviders ??
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
    overrides.assistantVoiceService ??
    createAssistantVoiceService(
      {
        getPreferences: assistantStore.getPreferences.bind(assistantStore),
        ...(overrides.assistantVoiceRepository ?? assistantRepository),
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
    overrides.receiptService ?? createReceiptService(receiptRepository, cloudflareVisionProvider);
  const aiEntryService =
    overrides.aiEntryService ??
    createAiEntryService(receiptRepository, importStore, dynamicVoiceProviders.transcription);
  const platformAdminStore = overrides.platformAdmins ?? platformAdminRepository;
  const platformAdminService =
    overrides.platformAdminService ?? createPlatformAdminService(platformAdminStore);
  const bugReportStore = overrides.bugReports ?? bugReportRepository;
  const bugReportEgressAuditStore =
    overrides.bugReportEgressAudit ?? bugReportEgressAuditRepository;
  const bugReportService = overrides.bugReportService ?? createBugReportService(bugReportStore);
  const customerReviews = overrides.customerReviews ?? customerReviewRepository;
  const accountDeletionService =
    overrides.accountDeletionService ??
    createAccountDeletionService(undefined, undefined, billingStore, platformAdminStore);
  const readinessCheck = overrides.readinessCheck ?? checkApiReadiness;

  return {
    dashboardLoader,
    cashflowTrendLoader,
    transferFeeLoader,
    readinessCheck,
    transactions: transactionStore,
    categories: categoryStore,
    accounts: accountStore,
    budgets: budgetStore,
    workspaceSettings: workspaceSettingsStore,
    onboarding: onboardingStore,
    billing: billingStore,
    subscriptions: subscriptionStore,
    events: eventStore,
    goals: goalStore,
    debts: debtStore,
    imports: importStore,
    mobileSync: mobileSyncStore,
    rateLimiter,
    authVerifier,
    tenantResolver: resolveTenant,
    supportProvider,
    assistantService,
    assistantVoiceService,
    receiptService,
    aiEntryService,
    accountDeletionService,
    platformAdminService,
    bugReports: bugReportStore,
    bugReportService,
    bugReportEgressAudit: bugReportEgressAuditStore,
    bugReportEgressRedact: overrides.bugReportEgressRedact,
    customerReviews,
  };
}
