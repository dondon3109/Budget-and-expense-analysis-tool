import type {
  SubscriptionInput,
  SubscriptionMonthSummary,
  SubscriptionRecord,
  SubscriptionStatusUpdate,
  SubscriptionUsage,
  SubscriptionUsageList,
  SubscriptionUsageTracking,
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

/** Subscription ROI check-ins (Pro); the Worker answers 403 `upgrade_required` on other plans. */
export function getSubscriptionUsage(
  workspace: AuthenticatedWorkspace,
): Promise<SubscriptionUsageList> {
  return requestJson(workspace, "/api/app/subscriptions/usage");
}

export function checkInSubscription(
  workspace: AuthenticatedWorkspace,
  args: { id: string; usedOn: string },
): Promise<SubscriptionUsage> {
  return requestJson(workspace, `/api/app/subscriptions/${encodeURIComponent(args.id)}/usage`, {
    method: "POST",
    body: JSON.stringify({ usedOn: args.usedOn }),
  });
}

export function undoSubscriptionCheckIn(
  workspace: AuthenticatedWorkspace,
  args: { id: string; usedOn: string },
): Promise<SubscriptionUsage> {
  return requestJson(
    workspace,
    `/api/app/subscriptions/${encodeURIComponent(args.id)}/usage/${args.usedOn}`,
    { method: "DELETE" },
  );
}

export function setSubscriptionUsageTracking(
  workspace: AuthenticatedWorkspace,
  args: { id: string; tracked: boolean },
): Promise<SubscriptionUsageTracking> {
  return requestJson(
    workspace,
    `/api/app/subscriptions/${encodeURIComponent(args.id)}/usage/tracking`,
    { method: "PUT", body: JSON.stringify({ tracked: args.tracked }) },
  );
}
