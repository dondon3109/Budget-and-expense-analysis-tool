import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

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
