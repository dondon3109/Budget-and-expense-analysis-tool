import { ApiTransportError } from "@/api/authenticated";
import {
  checkInSubscription,
  getSubscriptionUsage,
  setSubscriptionUsageTracking,
  undoSubscriptionCheckIn,
  type SubscriptionUsageApi,
} from "@/api/subscription-usage";
import type { QueuedSubscriptionUsage } from "@/db/transaction-mutation-repository";
import type { LocalWorkspace } from "@/db/workspace";

function send(api: SubscriptionUsageApi, tap: QueuedSubscriptionUsage): Promise<unknown> {
  if (tap.action === "check_in") return checkInSubscription(api, tap.subscriptionId, tap.usedOn!);
  if (tap.action === "undo") return undoSubscriptionCheckIn(api, tap.subscriptionId, tap.usedOn!);
  return setSubscriptionUsageTracking(api, tap.subscriptionId, tap.action === "track");
}

/** The Worker will never take this tap: no Pro, a gone bill, or a date outside the window. */
function refused(error: unknown): boolean {
  return error instanceof ApiTransportError && [400, 403, 404].includes(error.status);
}

let running: Promise<void> | null = null;

/**
 * Uploads the personal workspace's queued Subscription ROI taps in order, then reads the Worker's
 * list back into the phone once the queue is empty. A refused tap is dropped; a connection
 * failure stops and leaves the rest for the next sync. One run at a time, so a tap never uploads
 * twice concurrently (a repeat would still be harmless: every route is idempotent).
 */
export function uploadSubscriptionUsage(
  workspace: LocalWorkspace,
  accessToken: string,
): Promise<void> {
  running ??= drain(workspace, { accessToken }).finally(() => {
    running = null;
  });
  return running;
}

async function drain(workspace: LocalWorkspace, api: SubscriptionUsageApi): Promise<void> {
  const mutations = workspace.transactionMutations;
  for (const tap of await mutations.readyQueuedSubscriptionUsage()) {
    try {
      await send(api, tap);
    } catch (error) {
      if (!refused(error)) return;
    }
    await mutations.finishQueuedSubscriptionUsage(tap.sequence);
  }
  try {
    await mutations.replaceSubscriptionUsage(await getSubscriptionUsage(api));
  } catch (error) {
    // Not Pro (anymore): keep what the phone has; the card shows the Pro teaser instead.
    if (!refused(error)) throw error;
  }
}
