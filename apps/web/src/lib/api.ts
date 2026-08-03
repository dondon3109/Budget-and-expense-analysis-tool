import type {
  AccountInput,
  AccountRecord,
  AccountUpdate,
  AssistantMessageInput,
  AssistantMessagePage,
  AssistantPreferences,
  AssistantPreferenceUpdate,
  AssistantThreadPage,
  AssistantTurnResult,
  BillingCapability,
  BillingCheckoutReconciliation,
  BillingFeature,
  BillingInterval,
  BillingResource,
  BillingSummary,
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
} from "@zoption/shared";

import { getSupabaseClient } from "./supabase";
import type { AuthenticatedWorkspace } from "./workspace";

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

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

async function workspaceFetch(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit,
  options: { retryUnauthorized?: boolean } = {},
): Promise<Response> {
  const run = async (refresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await accessToken(workspace, refresh)}`);
    return fetch(`${apiUrl}${path}`, { ...init, headers });
  };

  let response = await run(false);
  if (response.status === 410) {
    await signOutAfterUnauthorized();
  } else if (response.status === 401 && options.retryUnauthorized !== false) {
    try {
      response = await run(true);
    } catch {
      await signOutAfterUnauthorized();
      throw new ApiRequestError("Your session has expired. Sign in again.", 401, "session_expired");
    }
    if (response.status === 401) await signOutAfterUnauthorized();
  }
  return response;
}

async function requestJson<T>(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit = {},
  options: { retryUnauthorized?: boolean } = {},
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
): Promise<{ approvalUrl: string }> {
  return requestJson(workspace, "/api/app/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
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
  args: { id: string; input: AccountUpdate },
): Promise<AccountRecord> {
  return requestJson(workspace, `/api/app/accounts/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteAccount(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/accounts/${id}`, { method: "DELETE" });
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
