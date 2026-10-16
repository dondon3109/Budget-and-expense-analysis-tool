import type { Debt, DebtInput, DebtUpdate } from "@zoption/shared";

import { captureFunnelEvent } from "../../analytics/funnel";
import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getDebts(workspace: AuthenticatedWorkspace): Promise<{ items: Debt[] }> {
  return requestJson(workspace, "/api/app/debts");
}

export async function createDebt(
  workspace: AuthenticatedWorkspace,
  input: DebtInput,
): Promise<Debt> {
  const created = await requestJson<Debt>(workspace, "/api/app/debts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureFunnelEvent("debt_created", {});
  return created;
}

export async function updateDebt(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: DebtUpdate },
): Promise<Debt> {
  const updated = await requestJson<Debt>(
    workspace,
    `/api/app/debts/${encodeURIComponent(args.id)}`,
    { method: "PATCH", body: JSON.stringify(args.input) },
  );
  captureFunnelEvent("debt_updated", {});
  return updated;
}

export async function deleteDebt(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  await requestJson<void>(workspace, `/api/app/debts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  captureFunnelEvent("debt_deleted", {});
}
