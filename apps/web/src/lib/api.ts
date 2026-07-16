import type {
  AccountRecord,
  CategoryInput,
  CategoryRecord,
  CategoryUpdate,
  BudgetMonthPlan,
  BudgetUpsert,
  DashboardSummary,
  ImportCommitResult,
  ImportPreview,
  ImportPreviewRequest,
  TransactionInput,
  TransactionExportQuery,
  TransactionListItem,
  TransactionListQuery,
  TransactionPage,
  TransactionUpdate,
} from "@budget/shared";

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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiRequestError(
      payload?.message ?? "The request could not be completed.",
      response.status,
      payload?.error ?? "request_failed",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${apiUrl}${path}`, { headers: { Accept: "text/csv" } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new ApiRequestError(
      payload?.message ?? "The download could not be prepared.",
      response.status,
      payload?.error ?? "request_failed",
    );
  }
  return response.blob();
}

export function getDashboard(): Promise<DashboardSummary> {
  return requestJson("/api/dashboard?from=2026-07-01&to=2026-07-31");
}

export function getTransactions(query: TransactionListQuery): Promise<TransactionPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return requestJson(`/api/transactions?${search.toString()}`);
}

export function createTransaction(input: TransactionInput): Promise<TransactionListItem> {
  return requestJson("/api/transactions", { method: "POST", body: JSON.stringify(input) });
}

export function updateTransaction(args: {
  id: string;
  input: TransactionUpdate;
}): Promise<TransactionListItem> {
  return requestJson(`/api/transactions/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteTransaction(id: string): Promise<void> {
  return requestJson(`/api/transactions/${id}`, { method: "DELETE" });
}

export async function getCategories(includeArchived = false): Promise<CategoryRecord[]> {
  const result = await requestJson<{ items: CategoryRecord[] }>(
    `/api/categories${includeArchived ? "?includeArchived=true" : ""}`,
  );
  return result.items;
}

export async function getAccounts(): Promise<AccountRecord[]> {
  const result = await requestJson<{ items: AccountRecord[] }>("/api/accounts");
  return result.items;
}

export function createCategory(input: CategoryInput): Promise<CategoryRecord> {
  return requestJson("/api/categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateCategory(args: {
  id: string;
  input: CategoryUpdate;
}): Promise<CategoryRecord> {
  return requestJson(`/api/categories/${args.id}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function previewImport(input: ImportPreviewRequest): Promise<ImportPreview> {
  return requestJson("/api/imports/preview", { method: "POST", body: JSON.stringify(input) });
}

export function commitImport(token: string): Promise<ImportCommitResult> {
  return requestJson("/api/imports/commit", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getBudgets(month: string): Promise<BudgetMonthPlan> {
  return requestJson(`/api/budgets?month=${encodeURIComponent(month)}`);
}

export function saveBudgets(input: BudgetUpsert): Promise<BudgetMonthPlan> {
  return requestJson("/api/budgets", { method: "PUT", body: JSON.stringify(input) });
}

export async function downloadTransactions(query: TransactionExportQuery): Promise<void> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const blob = await requestBlob(`/api/exports/transactions.csv?${search.toString()}`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "clarity-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
