import {
  subscriptionUsageListSchema,
  subscriptionUsageSchema,
  subscriptionUsageTrackingSchema,
  type SubscriptionUsage,
  type SubscriptionUsageList,
  type SubscriptionUsageTracking,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface SubscriptionUsageApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// Subscription ROI (Pro). Worker state, not ledger data: taps bypass the outbox, wait in the local
// queue (`subscription-usage-upload.ts`), and always act in the personal workspace.
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
    fallback: "Zoption could not save that check-in.",
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
    fallback: "Zoption could not undo that check-in.",
    decode: (value) => subscriptionUsageSchema.parse(value),
  });
}

export function setSubscriptionUsageTracking(
  api: SubscriptionUsageApi,
  id: string,
  tracked: boolean,
): Promise<SubscriptionUsageTracking> {
  return apiRequest({
    ...api,
    path: `${PATH}/${encodeURIComponent(id)}/usage/tracking`,
    method: "PUT",
    body: { tracked },
    fallback: "Zoption could not save whether to track that bill.",
    decode: (value) => subscriptionUsageTrackingSchema.parse(value),
  });
}
