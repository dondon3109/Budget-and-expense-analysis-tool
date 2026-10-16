import type {
  SubscriptionInput,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
} from "@zoption/shared";

import { captureFunnelEvent } from "../../analytics/funnel";
import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getSubscriptions(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<SubscriptionMonthSummary> {
  return requestJson(workspace, `/api/app/subscriptions?month=${encodeURIComponent(month)}`);
}

export async function createSubscription(
  workspace: AuthenticatedWorkspace,
  input: SubscriptionInput,
): Promise<SubscriptionRecord> {
  const created = await requestJson<SubscriptionRecord>(workspace, "/api/app/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureFunnelEvent("subscription_created", {});
  return created;
}

export async function updateSubscription(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: SubscriptionInput },
): Promise<SubscriptionRecord> {
  const updated = await requestJson<SubscriptionRecord>(
    workspace,
    `/api/app/subscriptions/${encodeURIComponent(args.id)}`,
    { method: "PATCH", body: JSON.stringify(args.input) },
  );
  captureFunnelEvent("subscription_updated", {});
  return updated;
}

export async function deleteSubscription(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<void> {
  await requestJson<void>(workspace, `/api/app/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  captureFunnelEvent("subscription_deleted", {});
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
