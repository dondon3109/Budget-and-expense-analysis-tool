import type {
  AccountRecord,
  BudgetMonthPlan,
  BudgetUpsert,
  CategoryInput,
  CategoryRecord,
  CategoryUpdate,
  DashboardSummary,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
  SubscriptionInput,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
  TransactionExportQuery,
  TransactionInput,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
  TransactionUpdate,
} from "@budget/shared";

import { getSupabaseClient } from "./supabase";
import type { AuthenticatedWorkspace } from "./workspace";

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
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
): Promise<Response> {
  const run = async (refresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await accessToken(workspace, refresh)}`);
    return fetch(`${apiUrl}${path}`, { ...init, headers });
  };

  let response = await run(false);
  if (response.status === 401) {
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
): Promise<T> {
  const response = await workspaceFetch(workspace, path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiRequestError(
      payload?.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The request could not be completed."),
      response.status,
      payload?.error ?? "request_failed",
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
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiRequestError(
      payload?.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The download could not be prepared."),
      response.status,
      payload?.error ?? "request_failed",
    );
  }
  return response.blob();
}

export function getDashboard(workspace: AuthenticatedWorkspace): Promise<DashboardSummary> {
  return requestJson(workspace, "/api/app/dashboard?from=2026-07-01&to=2026-07-31");
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
  token: string,
): Promise<ImportCommitResult> {
  return requestJson(workspace, "/api/app/imports/commit", {
    method: "POST",
    body: JSON.stringify({ token }),
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
  anchor.download = "clarity-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
