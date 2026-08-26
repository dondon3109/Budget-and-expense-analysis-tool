import { transactionVoiceDraftSchema } from "@zoption/shared";
import type {
  AccountInput,
  AccountInterestUpdate,
  AccountRecord,
  AccountUpdateWithInterest,
  AssistantMemory,
  AssistantMemoryPreferences,
  AssistantMemoryPreferencesUpdate,
  AssistantMessageInput,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantPreferenceUpdate,
  AssistantThreadPage,
  AssistantTurnResult,
  AssistantSpeechVoice,
  AssistantVoicePreferences,
  AssistantVoiceTranscription,
  ReceiptDraft,
  ReceiptPreferences,
  BillingCapability,
  BillingCheckoutResponse,
  BillingCheckoutReconciliation,
  BillingFeature,
  BillingInterval,
  BillingProviderConfig,
  BillingResource,
  BillingSummary,
  AdminBugReport,
  BugReport,
  BugReportCreateInput,
  BugReportDraft,
  BugReportStatus,
  SponsoredProSeat,
  SponsoredProSeatSummary,
  BudgetMonthPlan,
  BudgetUpsert,
  CalendarEventInput,
  CalendarEventMonth,
  CalendarEventRecord,
  CalendarEventUpdate,
  CashflowTrend,
  CategoryInput,
  CategoryRecord,
  CategoryUpdate,
  CustomerReview,
  CustomerReviewAdminDashboard,
  CustomerReviewInput,
  CustomerReviewModerationStatus,
  CustomerReviewState,
  DashboardSummary,
  Debt,
  DebtInput,
  DebtUpdate,
  FinancialGoal,
  FinancialGoalInput,
  FinancialGoalUpdate,
  ImportCommitRequest,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
  PublicCustomerReview,
  SubscriptionInput,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
  TransactionCalendarMonth,
  TransactionExportQuery,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
  TransactionUpdate,
  TransactionVoiceDraft,
  TransferFeeInsight,
} from "@zoption/shared";

import { getSupabaseClient } from "./supabase";
import type { AuthenticatedWorkspace } from "./workspace";

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export type SupportPageContext =
  | "landing"
  | "dashboard"
  | "assistant"
  | "calendar"
  | "transactions"
  | "import"
  | "budgets"
  | "subscriptions"
  | "plan"
  | "settings"
  | "app";

export interface SupportChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface SupportChatResponse {
  message: string;
  bugReportDraft?: BugReportDraft;
}

export async function getPublicCustomerReviews(
  signal?: AbortSignal,
): Promise<PublicCustomerReview[]> {
  const response = await fetch(`${apiUrl}/api/reviews`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new ApiRequestError(
      "Customer reviews could not be loaded.",
      response.status,
      "reviews_unavailable",
    );
  }
  const payload = (await response.json()) as { items?: PublicCustomerReview[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface UsageLimitReachedDetails {
  feature: BillingFeature;
  used: number;
  limit: number;
  periodKind?: "calendar_month" | "anchored_14_day";
  periodStartedAt?: string | null;
  resetsAt: string | null;
  billingPath?: string;
}

export interface ResourceLimitReachedDetails {
  resource: BillingResource;
  used: number;
  limit: number;
  billingPath?: string;
}

export interface UpgradeRequiredDetails {
  capability: BillingCapability;
}

const billingFeatures = new Set<BillingFeature>(["assistant_question", "file_import"]);
const billingResources = new Set<BillingResource>(["custom_category"]);
const billingCapabilities = new Set<BillingCapability>([
  "assistant_question",
  "file_import",
  "category_management",
  "account_management",
  "cashflow_analytics",
  "transaction_export",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiErrorPayload(value: unknown): {
  error?: string;
  message?: string;
  details?: unknown;
} {
  if (!isRecord(value)) return {};
  return {
    error: typeof value.error === "string" ? value.error : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    ...(Object.hasOwn(value, "details") ? { details: value.details } : {}),
  };
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

export function isUsageLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: UsageLimitReachedDetails } {
  if (
    !isApiRequestError(error) ||
    (error.code !== "monthly_limit_reached" && error.code !== "assistant_cycle_limit_reached")
  ) {
    return false;
  }
  if (!isRecord(error.details)) return false;
  const periodKind = error.details.periodKind;
  const periodStartedAt = error.details.periodStartedAt;
  const resetsAt = error.details.resetsAt;
  return (
    typeof error.details.feature === "string" &&
    billingFeatures.has(error.details.feature as BillingFeature) &&
    typeof error.details.used === "number" &&
    Number.isFinite(error.details.used) &&
    error.details.used >= 0 &&
    typeof error.details.limit === "number" &&
    Number.isFinite(error.details.limit) &&
    error.details.limit >= 0 &&
    (periodKind === undefined ||
      periodKind === "calendar_month" ||
      periodKind === "anchored_14_day") &&
    (periodStartedAt === undefined ||
      periodStartedAt === null ||
      typeof periodStartedAt === "string") &&
    (resetsAt === null || typeof resetsAt === "string")
  );
}

export function isMonthlyLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: UsageLimitReachedDetails } {
  return isUsageLimitReachedError(error) && error.code === "monthly_limit_reached";
}

export function isResourceLimitReachedError(
  error: unknown,
): error is ApiRequestError & { details: ResourceLimitReachedDetails } {
  if (!isApiRequestError(error) || error.code !== "resource_limit_reached") return false;
  if (!isRecord(error.details)) return false;
  return (
    typeof error.details.resource === "string" &&
    billingResources.has(error.details.resource as BillingResource) &&
    typeof error.details.used === "number" &&
    Number.isFinite(error.details.used) &&
    error.details.used >= 0 &&
    typeof error.details.limit === "number" &&
    Number.isFinite(error.details.limit) &&
    error.details.limit >= 0
  );
}

export function isUpgradeRequiredError(
  error: unknown,
): error is ApiRequestError & { details: UpgradeRequiredDetails } {
  if (!isApiRequestError(error) || error.code !== "upgrade_required") return false;
  if (!isRecord(error.details)) return false;
  return (
    typeof error.details.capability === "string" &&
    billingCapabilities.has(error.details.capability as BillingCapability)
  );
}

export function isBillingEnforcementError(error: unknown): error is ApiRequestError {
  return (
    isApiRequestError(error) &&
    (error.code === "monthly_limit_reached" ||
      error.code === "assistant_cycle_limit_reached" ||
      error.code === "resource_limit_reached" ||
      error.code === "upgrade_required")
  );
}

export function isSubscriptionBlocksAccountDeletionError(error: unknown): error is ApiRequestError {
  return isApiRequestError(error) && error.code === "subscription_blocks_account_deletion";
}

async function accessToken(workspace: AuthenticatedWorkspace, refresh: boolean): Promise<string> {
  const client = getSupabaseClient();
  const result = refresh ? await client.auth.refreshSession() : await client.auth.getSession();
  if (result.error) throw result.error;
  const session = result.data.session;
  if (!session || session.user.id !== workspace.userId) {
    throw new ApiRequestError("Your session has expired. Sign in again.", 401, "session_expired");
  }
  return session.access_token;
}

async function signOutAfterUnauthorized() {
  try {
    await getSupabaseClient().auth.signOut({ scope: "local" });
  } catch {
    // The auth state listener still clears local workspace data when sign-out succeeds locally.
  }
}

/** Hard ceiling for API requests so a stalled worker cannot leave the UI hanging indefinitely. */
const REQUEST_TIMEOUT_MS = 20_000;

async function workspaceFetch(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit,
  options: { retryUnauthorized?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const run = async (refresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await accessToken(workspace, refresh)}`);
    return fetch(`${apiUrl}${path}`, { ...init, headers, signal: controller.signal });
  };

  try {
    let response = await run(false);
    if (response.status === 410) {
      await signOutAfterUnauthorized();
    } else if (response.status === 401 && options.retryUnauthorized !== false) {
      try {
        response = await run(true);
      } catch {
        await signOutAfterUnauthorized();
        throw new ApiRequestError(
          "Your session has expired. Sign in again.",
          401,
          "session_expired",
        );
      }
      if (response.status === 401) await signOutAfterUnauthorized();
    }
    return response;
  } catch (error) {
    if (
      controller.signal.aborted &&
      !(error instanceof ApiRequestError) &&
      !(error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new ApiRequestError("The request took too long. Try again.", 0, "request_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function requestJson<T>(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit = {},
  options: { retryUnauthorized?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const response = await workspaceFetch(
    workspace,
    path,
    {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
    options,
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The request could not be completed."),
      response.status,
      payload.error ?? "request_failed",
      payload.details,
    );
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    throw new ApiRequestError(
      "The API returned an unexpected response. Check the API URL configuration.",
      502,
      "invalid_api_response",
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError(
      "The API returned invalid JSON. Try again or check the API deployment.",
      502,
      "invalid_api_response",
    );
  }
}

async function requestBlob(workspace: AuthenticatedWorkspace, path: string): Promise<Blob> {
  const response = await workspaceFetch(workspace, path, { headers: { Accept: "text/csv" } });
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The download could not be prepared."),
      response.status,
      payload.error ?? "request_failed",
      payload.details,
    );
  }
  return response.blob();
}

export async function sendSupportChat(
  messages: SupportChatMessageInput[],
  pageContext: SupportPageContext,
  signal?: AbortSignal,
): Promise<SupportChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("request_timeout"), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason ?? "request_aborted");
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(`${apiUrl}/api/support/chat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ messages, pageContext }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = apiErrorPayload(await response.json().catch(() => null));
      throw new ApiRequestError(
        payload.message ?? "Zoption Support could not answer right now. Please try again.",
        response.status,
        payload.error ?? "support_request_failed",
        payload.details,
      );
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || typeof payload.message !== "string" || !payload.message.trim()) {
      throw new ApiRequestError(
        "Zoption Support returned an unexpected response. Please try again.",
        502,
        "invalid_api_response",
      );
    }
    return { message: payload.message.trim() };
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted)
        throw new DOMException("The support request was cancelled.", "AbortError");
      throw new ApiRequestError(
        "Zoption Support took too long to answer. Please try again.",
        0,
        "request_timeout",
      );
    }
    throw new ApiRequestError(
      "Zoption Support could not connect. Check your connection and try again.",
      0,
      "network_error",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function sendAuthenticatedSupportChat(
  workspace: AuthenticatedWorkspace,
  messages: SupportChatMessageInput[],
  pageContext: Exclude<SupportPageContext, "landing">,
  signal?: AbortSignal,
): Promise<SupportChatResponse> {
  return requestJson(workspace, "/api/app/support/chat", {
    method: "POST",
    body: JSON.stringify({ messages, pageContext }),
    signal,
  });
}

export function createBugReport(
  workspace: AuthenticatedWorkspace,
  input: BugReportCreateInput,
): Promise<BugReport> {
  return requestJson(workspace, "/api/app/support/bug-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCustomerReviewState(
  workspace: AuthenticatedWorkspace,
): Promise<CustomerReviewState> {
  return requestJson(workspace, "/api/app/reviews/me");
}

export function saveCustomerReview(
  workspace: AuthenticatedWorkspace,
  input: CustomerReviewInput,
): Promise<CustomerReview> {
  return requestJson(workspace, "/api/app/reviews/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteCustomerReview(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/reviews/me", { method: "DELETE" });
}

export function getAdminCustomerReviews(
  workspace: AuthenticatedWorkspace,
  query: {
    page: number;
    pageSize: number;
    status?: CustomerReviewModerationStatus;
    rating?: number;
    search?: string;
  },
): Promise<CustomerReviewAdminDashboard> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  if (query.rating) params.set("rating", String(query.rating));
  if (query.search) params.set("search", query.search);
  return requestJson(workspace, `/api/app/admin/reviews?${params.toString()}`);
}

export function updateAdminCustomerReviewStatus(
  workspace: AuthenticatedWorkspace,
  id: string,
  status: Exclude<CustomerReviewModerationStatus, "pending">,
): Promise<CustomerReviewAdminDashboard> {
  return requestJson(workspace, `/api/app/admin/reviews/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateAdminCustomerReviewLineup(
  workspace: AuthenticatedWorkspace,
  reviewIds: string[],
): Promise<CustomerReviewAdminDashboard> {
  return requestJson(workspace, "/api/app/admin/reviews/lineup", {
    method: "PUT",
    body: JSON.stringify({ reviewIds }),
  });
}

export function getBugReports(workspace: AuthenticatedWorkspace): Promise<BugReport[]> {
  return requestJson(workspace, "/api/app/support/bug-reports");
}

export function getAdminBugReports(workspace: AuthenticatedWorkspace): Promise<AdminBugReport[]> {
  return requestJson(workspace, "/api/app/admin/bug-reports");
}

export function updateAdminBugReportStatus(
  workspace: AuthenticatedWorkspace,
  id: string,
  status: BugReportStatus,
): Promise<AdminBugReport> {
  return requestJson(workspace, `/api/app/admin/bug-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getBillingSummary(workspace: AuthenticatedWorkspace): Promise<BillingSummary> {
  return requestJson(workspace, "/api/app/billing");
}

export function reconcileBillingCheckout(
  workspace: AuthenticatedWorkspace,
): Promise<BillingCheckoutReconciliation> {
  return requestJson(workspace, "/api/app/billing/reconcile", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function startBillingCheckout(
  workspace: AuthenticatedWorkspace,
  interval: BillingInterval,
): Promise<BillingCheckoutResponse> {
  return requestJson(workspace, "/api/app/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
}

export function getBillingProviderConfig(
  workspace: AuthenticatedWorkspace,
): Promise<BillingProviderConfig> {
  return requestJson(workspace, "/api/app/billing/checkout/config");
}

export function cancelBillingSubscription(
  workspace: AuthenticatedWorkspace,
): Promise<{ cancellationRequested: true }> {
  return requestJson(workspace, "/api/app/billing/cancel", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function syncVerifiedIdentity(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/identity", { method: "POST", body: JSON.stringify({}) });
}

export function getSponsoredProSeats(
  workspace: AuthenticatedWorkspace,
): Promise<SponsoredProSeatSummary> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats");
}

export function addSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function inviteSponsoredProRecipient(
  workspace: AuthenticatedWorkspace,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function replaceSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}`, {
    method: "PUT",
    body: JSON.stringify({ email }),
  });
}

export function revokeSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
): Promise<void> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}`, {
    method: "DELETE",
  });
}

export function resendSponsoredProInvitation(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
): Promise<void> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}/invitation`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getDashboard(
  workspace: AuthenticatedWorkspace,
  period: { from: string; to: string },
): Promise<DashboardSummary> {
  return requestJson(workspace, `/api/app/dashboard?${new URLSearchParams(period).toString()}`);
}

export function getCashflowTrend(
  workspace: AuthenticatedWorkspace,
  query: { view: CashflowTrend["view"]; anchorDate: string },
): Promise<CashflowTrend> {
  return requestJson(
    workspace,
    `/api/app/dashboard/cashflow-trend?${new URLSearchParams(query).toString()}`,
  );
}

export function getTransferFeeInsight(
  workspace: AuthenticatedWorkspace,
): Promise<TransferFeeInsight> {
  return requestJson(workspace, "/api/app/dashboard/transfer-fees");
}

export function getTransactions(
  workspace: AuthenticatedWorkspace,
  query: TransactionListQuery,
): Promise<TransactionPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return requestJson(workspace, `/api/app/transactions?${search.toString()}`);
}

export function getTransactionCalendar(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<TransactionCalendarMonth> {
  return requestJson(
    workspace,
    `/api/app/transactions/calendar?month=${encodeURIComponent(month)}`,
  );
}

export function createTransaction(
  workspace: AuthenticatedWorkspace,
  input: TransactionInput,
): Promise<TransactionListItem> {
  return requestJson(workspace, "/api/app/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTransaction(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: TransactionUpdate },
): Promise<TransactionListItem> {
  return requestJson(workspace, `/api/app/transactions/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteTransaction(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/transactions/${id}`, { method: "DELETE" });
}

export function getCalendarEvents(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<CalendarEventMonth> {
  return requestJson(workspace, `/api/app/events?month=${encodeURIComponent(month)}`);
}

export function createCalendarEvent(
  workspace: AuthenticatedWorkspace,
  input: CalendarEventInput,
): Promise<CalendarEventRecord> {
  return requestJson(workspace, "/api/app/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCalendarEvent(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: CalendarEventUpdate },
): Promise<CalendarEventRecord> {
  return requestJson(workspace, `/api/app/events/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteCalendarEvent(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/events/${id}`, { method: "DELETE" });
}

export async function getCategories(
  workspace: AuthenticatedWorkspace,
  includeArchived = false,
): Promise<CategoryRecord[]> {
  const result = await requestJson<{ items: CategoryRecord[] }>(
    workspace,
    `/api/app/categories${includeArchived ? "?includeArchived=true" : ""}`,
  );
  return result.items;
}

export async function getAccounts(workspace: AuthenticatedWorkspace): Promise<AccountRecord[]> {
  const result = await requestJson<{ items: AccountRecord[] }>(workspace, "/api/app/accounts");
  return result.items;
}

export function createAccount(
  workspace: AuthenticatedWorkspace,
  input: AccountInput,
): Promise<AccountRecord> {
  return requestJson(workspace, "/api/app/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAccount(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: AccountUpdateWithInterest },
): Promise<AccountRecord> {
  return requestJson(workspace, `/api/app/accounts/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteAccount(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/accounts/${id}`, { method: "DELETE" });
}

export function updateAccountInterest(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: AccountInterestUpdate },
): Promise<AccountRecord> {
  return requestJson(workspace, `/api/app/accounts/${args.id}/interest`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export type AccountDeletionResult = { status: "deleted" | "cleanup_pending" };

export function deleteCurrentAccount(
  workspace: AuthenticatedWorkspace,
  password: string,
): Promise<AccountDeletionResult> {
  return requestJson(
    workspace,
    "/api/app/account",
    {
      method: "DELETE",
      body: JSON.stringify({ confirmation: "DELETE", password }),
    },
    { retryUnauthorized: false },
  );
}

export function getAssistantPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences");
}

export function grantAssistantConsent(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export function getAssistantVoicePreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantVoicePreferences> {
  return requestJson(workspace, "/api/app/assistant/voice/preferences");
}

export function grantAssistantVoiceConsent(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantVoicePreferences> {
  return requestJson(workspace, "/api/app/assistant/voice/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export async function transcribeAssistantVoice(
  workspace: AuthenticatedWorkspace,
  audio: Blob,
): Promise<AssistantVoiceTranscription> {
  const form = new FormData();
  const extension = audio.type.includes("mp4")
    ? "m4a"
    : audio.type.includes("ogg")
      ? "ogg"
      : "webm";
  form.set("audio", audio, `voice-input.${extension}`);
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/transcriptions",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The recording could not be transcribed.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return (await response.json()) as AssistantVoiceTranscription;
}

export async function getAssistantVoiceSpeech(
  workspace: AuthenticatedWorkspace,
  messageId: string,
  voice: AssistantSpeechVoice = "default",
): Promise<Blob> {
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/speech",
    {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, voice }),
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The spoken reply could not be prepared.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return response.blob();
}

export async function getAssistantVoicePreview(
  workspace: AuthenticatedWorkspace,
  voice: AssistantSpeechVoice,
): Promise<Blob> {
  const response = await workspaceFetch(
    workspace,
    "/api/app/assistant/voice/preview",
    {
      method: "POST",
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: JSON.stringify({ voice }),
    },
    { timeoutMs: 45_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The voice preview could not be prepared.",
      response.status,
      payload.error ?? "assistant_voice_failed",
      payload.details,
    );
  }
  return response.blob();
}

export function updateAssistantIdentity(
  workspace: AuthenticatedWorkspace,
  input: Extract<AssistantPreferenceUpdate, { assistantName: string }>,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateAssistantResponsePreferences(
  workspace: AuthenticatedWorkspace,
  input: Extract<AssistantPreferenceUpdate, { responseDetail: string }>,
): Promise<AssistantPreferences> {
  return requestJson(workspace, "/api/app/assistant/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAssistantThreads(
  workspace: AuthenticatedWorkspace,
  cursor?: string,
): Promise<AssistantThreadPage> {
  const search = new URLSearchParams({ limit: "20" });
  if (cursor) search.set("cursor", cursor);
  return requestJson(workspace, `/api/app/assistant/threads?${search.toString()}`);
}

export function getAssistantMessages(
  workspace: AuthenticatedWorkspace,
  threadId: string,
  cursor?: string,
): Promise<AssistantMessagePage> {
  const search = new URLSearchParams({ limit: "50" });
  if (cursor) search.set("cursor", cursor);
  return requestJson(
    workspace,
    `/api/app/assistant/threads/${encodeURIComponent(threadId)}/messages?${search.toString()}`,
  );
}

export function createAssistantThread(
  workspace: AuthenticatedWorkspace,
  input: AssistantMessageInput,
): Promise<AssistantTurnResult> {
  return requestJson(workspace, "/api/app/assistant/threads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendAssistantMessage(
  workspace: AuthenticatedWorkspace,
  args: { threadId: string; input: AssistantMessageInput },
): Promise<AssistantTurnResult> {
  return requestJson(
    workspace,
    `/api/app/assistant/threads/${encodeURIComponent(args.threadId)}/messages`,
    { method: "POST", body: JSON.stringify(args.input) },
  );
}

export function deleteAssistantThread(
  workspace: AuthenticatedWorkspace,
  threadId: string,
): Promise<void> {
  return requestJson(workspace, `/api/app/assistant/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export function deleteAllAssistantThreads(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/assistant/threads", { method: "DELETE" });
}

export function getAssistantMemory(workspace: AuthenticatedWorkspace): Promise<AssistantMemory[]> {
  return requestJson(workspace, "/api/app/assistant/memory");
}

export function getAssistantMemoryPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<AssistantMemoryPreferences> {
  return requestJson(workspace, "/api/app/assistant/memory/preferences");
}

export function updateAssistantMemoryPreferences(
  workspace: AuthenticatedWorkspace,
  input: AssistantMemoryPreferencesUpdate,
): Promise<AssistantMemoryPreferences> {
  return requestJson(workspace, "/api/app/assistant/memory/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function clearAssistantMemory(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/assistant/memory", { method: "DELETE" });
}

export function createCategory(
  workspace: AuthenticatedWorkspace,
  input: CategoryInput,
): Promise<CategoryRecord> {
  return requestJson(workspace, "/api/app/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: CategoryUpdate },
): Promise<CategoryRecord> {
  return requestJson(workspace, `/api/app/categories/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function previewImport(
  workspace: AuthenticatedWorkspace,
  input: ImportPreviewRequest,
): Promise<ImportPreview> {
  return requestJson(workspace, "/api/app/imports/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function commitImport(
  workspace: AuthenticatedWorkspace,
  input: ImportCommitRequest,
): Promise<ImportCommitResult> {
  return requestJson(workspace, "/api/app/imports/commit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function getReceiptPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<ReceiptPreferences> {
  return requestJson(workspace, "/api/app/receipts/preferences");
}

export function grantReceiptConsent(
  workspace: AuthenticatedWorkspace,
): Promise<ReceiptPreferences> {
  return requestJson(workspace, "/api/app/receipts/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export async function extractReceipt(
  workspace: AuthenticatedWorkspace,
  image: Blob,
): Promise<ReceiptDraft> {
  const form = new FormData();
  const extension = image.type.includes("png")
    ? "png"
    : image.type.includes("webp")
      ? "webp"
      : "jpg";
  form.set("image", image, "receipt." + extension);
  const response = await workspaceFetch(
    workspace,
    "/api/app/receipts/extract",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    },
    { timeoutMs: 60_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The receipt could not be read.",
      response.status,
      payload.error ?? "receipt_extraction_failed",
      payload.details,
    );
  }
  return (await response.json()) as ReceiptDraft;
}

/** Uploads one temporary voice clip and returns a review-only transaction draft. */
export async function extractVoiceTransaction(
  workspace: AuthenticatedWorkspace,
  audio: Blob,
): Promise<TransactionVoiceDraft> {
  const form = new FormData();
  const extension = audio.type.includes("mp4")
    ? "m4a"
    : audio.type.includes("ogg")
      ? "ogg"
      : "webm";
  form.set("audio", audio, `voice-input.${extension}`);
  const response = await workspaceFetch(
    workspace,
    "/api/app/entry/voice",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    },
    { timeoutMs: 60_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The recording could not be read as a transaction.",
      response.status,
      payload.error ?? "entry_voice_failed",
      payload.details,
    );
  }
  let draft: TransactionVoiceDraft;
  try {
    draft = transactionVoiceDraftSchema.parse(await response.json());
  } catch {
    throw new ApiRequestError(
      "The recording could not be read as a transaction.",
      response.status,
      "entry_voice_failed",
    );
  }
  return draft;
}

export function getBudgets(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<BudgetMonthPlan> {
  return requestJson(workspace, `/api/app/budgets?month=${encodeURIComponent(month)}`);
}

export function saveBudgets(
  workspace: AuthenticatedWorkspace,
  input: BudgetUpsert,
): Promise<BudgetMonthPlan> {
  return requestJson(workspace, "/api/app/budgets", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function getFinancialGoals(
  workspace: AuthenticatedWorkspace,
): Promise<{ items: FinancialGoal[] }> {
  return requestJson(workspace, "/api/app/goals");
}

export function createFinancialGoal(
  workspace: AuthenticatedWorkspace,
  input: FinancialGoalInput,
): Promise<FinancialGoal> {
  return requestJson(workspace, "/api/app/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateFinancialGoal(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: FinancialGoalUpdate },
): Promise<FinancialGoal> {
  return requestJson(workspace, `/api/app/goals/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteFinancialGoal(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/goals/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getDebts(workspace: AuthenticatedWorkspace): Promise<{ items: Debt[] }> {
  return requestJson(workspace, "/api/app/debts");
}

export function createDebt(workspace: AuthenticatedWorkspace, input: DebtInput): Promise<Debt> {
  return requestJson(workspace, "/api/app/debts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateDebt(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: DebtUpdate },
): Promise<Debt> {
  return requestJson(workspace, `/api/app/debts/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteDebt(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/debts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getSubscriptions(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<SubscriptionMonthSummary> {
  return requestJson(workspace, `/api/app/subscriptions?month=${encodeURIComponent(month)}`);
}

export function createSubscription(
  workspace: AuthenticatedWorkspace,
  input: SubscriptionInput,
): Promise<SubscriptionRecord> {
  return requestJson(workspace, "/api/app/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSubscription(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: SubscriptionInput },
): Promise<SubscriptionRecord> {
  return requestJson(workspace, `/api/app/subscriptions/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteSubscription(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function setSubscriptionStatus(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: SubscriptionStatusUpdate },
): Promise<SubscriptionRecord> {
  return requestJson(workspace, `/api/app/subscriptions/${args.id}/status`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export async function downloadTransactions(
  workspace: AuthenticatedWorkspace,
  query: TransactionExportQuery,
): Promise<void> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const blob = await requestBlob(
    workspace,
    `/api/app/exports/transactions.csv?${search.toString()}`,
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "zoption-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
