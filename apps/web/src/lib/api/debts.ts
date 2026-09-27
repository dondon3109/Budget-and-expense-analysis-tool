import type { Debt, DebtInput, DebtUpdate } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

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
