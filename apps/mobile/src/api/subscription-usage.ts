import {
  subscriptionUsageListSchema,
  subscriptionUsageSchema,
  type SubscriptionUsage,
  type SubscriptionUsageList,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface SubscriptionUsageApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// Subscription ROI check-ins (Pro). Worker state, not ledger data: they bypass the outbox and
// need a connection, and they always act in the personal workspace.
const PATH = "/api/app/subscriptions";

export function getSubscriptionUsage(api: SubscriptionUsageApi): Promise<SubscriptionUsageList> {
  return apiRequest({
    ...api,
    path: `${PATH}/usage`,
    method: "GET",
    fallback: "Zoption could not load how often you use your bills. Try again shortly.",
    decode: (value) => subscriptionUsageListSchema.parse(value),
  });
}

export function checkInSubscription(
  api: SubscriptionUsageApi,
  id: string,
  usedOn: string,
): Promise<SubscriptionUsage> {
  return apiRequest({
    ...api,
    path: `${PATH}/${encodeURIComponent(id)}/usage`,
    method: "POST",
    body: { usedOn },
    fallback: "Zoption could not save that check-in. Try again when you are online.",
    decode: (value) => subscriptionUsageSchema.parse(value),
  });
}

export function undoSubscriptionCheckIn(
  api: SubscriptionUsageApi,
  id: string,
  usedOn: string,
): Promise<SubscriptionUsage> {
  return apiRequest({
    ...api,
    path: `${PATH}/${encodeURIComponent(id)}/usage/${usedOn}`,
    method: "DELETE",
    fallback: "Zoption could not undo that check-in. Try again when you are online.",
    decode: (value) => subscriptionUsageSchema.parse(value),
  });
}
