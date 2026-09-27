import type { FinancialGoal, FinancialGoalInput, FinancialGoalUpdate } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

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
