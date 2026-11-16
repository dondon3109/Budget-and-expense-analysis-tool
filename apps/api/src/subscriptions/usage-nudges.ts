import {
  addDaysToIsoDate,
  manilaDate,
  SUBSCRIPTION_NUDGE_LEAD_DAYS,
  type SubscriptionPushData,
} from "@zoption/shared";

import { pushRepository, type PushRepository } from "../db/push";
import {
  subscriptionUsageRepository,
  type IdleRenewal,
  type SubscriptionUsageRepository,
} from "../db/subscription-usage";
import { sendPush } from "../push";
import type { Bindings } from "../types";

const BATCH = 100;
const PERSONAL_TENANT_PREFIX = "user:";

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The nudge wording, shared by the push and its test. */
export function idleNudgeText(
  renewal: IdleRenewal,
  today: string,
): { title: string; body: string } {
  const idleDays = daysBetween(renewal.lastUsedOn, today);
  return {
    title: `Still using ${renewal.name}?`,
    body: `It renews in ${SUBSCRIPTION_NUDGE_LEAD_DAYS} days and you last used it ${idleDays} days ago. Cancel it or keep it?`,
  };
}

/**
 * Subscription ROI nudge: `SUBSCRIPTION_NUDGE_LEAD_DAYS` before an idle subscription renews, tell
 * its owner. Runs from the daily maintenance cron. The nudge is claimed before it is sent, so a
 * failed send is not retried: a missed nudge is better than a repeated one.
 */
export async function sendIdleSubscriptionNudges(
  env: Bindings,
  now: Date,
  usage: SubscriptionUsageRepository = subscriptionUsageRepository,
  push: PushRepository = pushRepository,
  send: typeof sendPush = sendPush,
): Promise<{ nudged: number; failed: number }> {
  const today = manilaDate(now);
  const billingDate = addDaysToIsoDate(today, SUBSCRIPTION_NUDGE_LEAD_DAYS);
  let nudged = 0;
  let failed = 0;
  for (;;) {
    const renewals = await usage.listIdleRenewals(env, billingDate, today, BATCH);
    for (const renewal of renewals) {
      if (!(await usage.claimNudge(env, renewal))) continue;
      const data: SubscriptionPushData = {
        path: "/subscriptions",
        subscriptionId: renewal.subscriptionId,
      };
      try {
        await send(env, push, {
          userIds: [renewal.tenantId.slice(PERSONAL_TENANT_PREFIX.length)],
          category: "subscription_idle",
          ...idleNudgeText(renewal, today),
          data,
        });
        nudged += 1;
      } catch (error) {
        failed += 1;
        console.log(
          JSON.stringify({
            message: "Subscription idle nudge failed",
            errorCode: error instanceof Error ? error.name : "unknown_error",
          }),
        );
      }
    }
    // Claimed rows drop out of the next read, so a short page means everything was seen.
    if (renewals.length < BATCH) break;
  }
  return { nudged, failed };
}
