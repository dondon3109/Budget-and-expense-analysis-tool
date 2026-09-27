import type {
  AccountInput,
  AccountInterestUpdate,
  AccountRecord,
  AccountUpdateWithInterest,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

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
