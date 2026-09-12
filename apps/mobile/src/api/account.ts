import { accountDeletionResponseSchema, type AccountDeletionRequest } from "@zoption/shared";

import { ApiTransportError, apiRequest } from "./authenticated";

export interface AccountApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type AccountDeletionStatus = "deleted" | "cleanup_pending";

/**
 * High-friction, online-only account deletion. The local encrypted workspace
 * must only be cleared after this returns a confirmed server status.
 */
export async function requestAccountDeletion(
  api: AccountApi,
  input: AccountDeletionRequest,
): Promise<AccountDeletionStatus> {
  const result = await apiRequest({
    ...api,
    path: "/api/app/account",
    method: "DELETE",
    body: input,
    fallback: "Account deletion could not be completed. Try again shortly.",
    decode: (value) => accountDeletionResponseSchema.parse(value),
  });
  return result.status;
}

/**
 * Unpaywalled, full account archive export. Returns the structured JSON
 * export containing accounts, categories, transactions, budgets, subscriptions,
 * financial goals, debts, and calendar events.
 */
export async function downloadAccountArchive(api: AccountApi): Promise<unknown> {
  return apiRequest({
    ...api,
    path: "/api/app/exports/account-archive.json",
    method: "GET",
    fallback: "Account archive could not be downloaded. Try again shortly.",
    decode: (value) => value,
  });
}

export { ApiTransportError };

export type { AccountDeletionRequest };
