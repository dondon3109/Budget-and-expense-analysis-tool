import {
  accountDeletionResponseSchema,
  type AccountDeletionRequest,
} from "@zoption/shared";

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

export { ApiTransportError };

export type { AccountDeletionRequest };
