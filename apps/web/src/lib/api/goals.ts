import type { FinancialGoal, FinancialGoalInput, FinancialGoalUpdate } from "@zoption/shared";

import { captureFunnelEvent } from "../../analytics/funnel";
import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getFinancialGoals(
  workspace: AuthenticatedWorkspace,
): Promise<{ items: FinancialGoal[] }> {
  return requestJson(workspace, "/api/app/goals");
}

export async function createFinancialGoal(
  workspace: AuthenticatedWorkspace,
  input: FinancialGoalInput,
): Promise<FinancialGoal> {
  const created = await requestJson<FinancialGoal>(workspace, "/api/app/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureFunnelEvent("goal_created", {});
  return created;
}

export async function updateFinancialGoal(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: FinancialGoalUpdate },
): Promise<FinancialGoal> {
  const updated = await requestJson<FinancialGoal>(
    workspace,
    `/api/app/goals/${encodeURIComponent(args.id)}`,
    { method: "PATCH", body: JSON.stringify(args.input) },
  );
  captureFunnelEvent("goal_updated", {});
  return updated;
}

export async function deleteFinancialGoal(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<void> {
  await requestJson<void>(workspace, `/api/app/goals/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  captureFunnelEvent("goal_deleted", {});
}
