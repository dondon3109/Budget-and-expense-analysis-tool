import type {
  SubscriptionInput,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getSubscriptions(
  workspace: AuthenticatedWorkspace,
  month: string,
): Promise<SubscriptionMonthSummary> {
  return requestJson(workspace, `/api/app/subscriptions?month=${encodeURIComponent(month)}`);
}

export function createSubscription(
  workspace: AuthenticatedWorkspace,
  input: SubscriptionInput,
): Promise<SubscriptionRecord> {
  return requestJson(workspace, "/api/app/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSubscription(
  workspace: AuthenticatedWorkspace,
  args: { id: string; input: SubscriptionInput },
): Promise<SubscriptionRecord> {
  return requestJson(workspace, `/api/app/subscriptions/${encodeURIComponent(args.id)}`, {
    method: "PATCH",
    body: JSON.stringify(args.input),
  });
}

export function deleteSubscription(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/subscriptions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
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
