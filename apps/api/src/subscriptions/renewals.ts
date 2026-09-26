import { nextSubscriptionBillingDate, type SubscriptionRenewalReason } from "@zoption/shared";

import {
  subscriptionRepository,
  type DueSubscriptionRenewal,
  type SubscriptionRenewalNotification,
  type SubscriptionRepository,
} from "../db/subscriptions";
import { escapeHtml, recipientAddress } from "../account-email";
import { enqueueJob } from "../jobs";
import { createResendSender, ResendError } from "../resend";
import type { Bindings, EmailSender } from "../types";

const SWEEP_LIMIT = 100;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1_000;
const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

export interface SubscriptionRenewalSweepResult {
  checked: number;
  charged: number;
  rolled: number;
  uncovered: number;
  archived: number;
  notified: number;
  failed: number;
}

export interface SubscriptionRenewalService {
  runDueRenewals(env: Bindings, limit?: number): Promise<SubscriptionRenewalSweepResult>;
  retryNotification(env: Bindings, notificationId: string): Promise<boolean>;
  retryPendingNotifications(
    env: Bindings,
    limit: number,
  ): Promise<{ claimed: number; sent: number; failed: number }>;
}

/** Manila calendar date. Every billing date in the app is written in this timezone. */
export function manilaDate(now = new Date()): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function formatAmount(amountMinor: number): string {
  return `PHP ${moneyFormatter.format(amountMinor / 100)}`;
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? date : dateFormatter.format(parsed);
}

function configuredSender(env: Bindings, injected?: EmailSender): EmailSender {
  if (injected) return injected;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("subscription_email_not_configured");
  return createResendSender(apiKey);
}

function senderAddress(env: Bindings): { email: string; name: string } {
  const email = env.EMAIL_FROM?.trim();
  if (!email) throw new Error("subscription_sender_not_configured");
  return { email, name: "Zoption" };
}

function subscriptionsUrl(env: Bindings): string | null {
  const configured = env.WEB_APP_URL?.trim();
  if (!configured) return null;
  try {
    return new URL("/app/subscriptions", configured).href;
  } catch {
    return null;
  }
}

function notificationMessage(
  env: Bindings,
  notification: SubscriptionRenewalNotification,
  recipient: string,
) {
  const name = notification.subscriptionName;
  const amount = formatAmount(notification.amountMinor);
  const account = notification.accountName ?? "the linked account";
  const dueDate = formatDate(notification.dueDate);
  const link = subscriptionsUrl(env);
  const archived = notification.reason === "account_archived";
  const subject = archived
    ? `Your ${name} subscription needs a different account`
    : `Your ${name} subscription could not be renewed`;
  const why = archived
    ? `${account} was removed from your accounts, so no expense was recorded and your balance is unchanged. Choose the account this subscription should be paid from, or restore ${account}, and the charge is recorded on the next attempt.`
    : `${account} does not have enough balance to cover this charge, so no expense was recorded and your balance is unchanged. Zoption will try again every day and record the charge as soon as the account can cover it.`;
  const action = archived
    ? "Choose a payment account"
    : "Top up the account or change the subscription";
  const heading = archived ? `${name} needs a different account` : `${name} could not be renewed`;
  const text = [
    `Zoption could not renew your ${name} subscription.`,
    "",
    `Amount: ${amount}`,
    `Account: ${account}`,
    `Due date: ${dueDate}`,
    "",
    why,
    "",
    ...(link ? [`${action}: ${link}`, ""] : []),
    "This is the only reminder for this missed renewal.",
  ].join("\n");
  const html = `<h1>${escapeHtml(heading)}</h1>
<p><strong>Amount:</strong> ${escapeHtml(amount)}<br>
<strong>Account:</strong> ${escapeHtml(account)}<br>
<strong>Due date:</strong> ${escapeHtml(dueDate)}</p>
<p>${escapeHtml(why)}</p>
${link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p>` : ""}
<p>This is the only reminder for this missed renewal.</p>`;
  return { to: recipient, from: senderAddress(env), subject, text, html };
}

function deliveryErrorCode(error: unknown): string {
  if (error instanceof ResendError) return `email_provider_${error.providerStatus}`;
  if (error instanceof Error && error.message.startsWith("subscription_")) return error.message;
  return "email_delivery_failed";
}

type RenewalOutcome = "charged" | "rolled" | "uncovered" | "archived";

export function createSubscriptionRenewalService(
  repository: SubscriptionRepository = subscriptionRepository,
  injected: { sender?: EmailSender; fetcher?: typeof fetch } = {},
): SubscriptionRenewalService {
  async function deliver(
    env: Bindings,
    notification: SubscriptionRenewalNotification,
  ): Promise<boolean> {
    try {
      const recipient = await recipientAddress(env, notification.tenantId, injected.fetcher);
      if (!recipient) {
        await repository.finishRenewalNotification(
          env,
          notification.id,
          "failed",
          "recipient_unavailable",
        );
        return false;
      }
      await configuredSender(env, injected.sender).send(
        notificationMessage(env, notification, recipient),
      );
      await repository.finishRenewalNotification(env, notification.id, "sent", null);
      return true;
    } catch (error) {
      await repository.finishRenewalNotification(
        env,
        notification.id,
        "failed",
        deliveryErrorCode(error),
      );
      return false;
    }
  }

  /**
   * Posts the charge for a due cycle, or rolls the schedule forward when that cycle was already
   * charged. Returns null when the subscription changed underneath the sweep, leaving the work
   * for the next run.
   */
  async function settleRenewal(
    env: Bindings,
    renewal: DueSubscriptionRenewal,
  ): Promise<RenewalOutcome | null> {
    const nextBillingDate = nextSubscriptionBillingDate(
      renewal.nextBillingDate,
      renewal.billingCycle,
    );
    if (renewal.charged) {
      const advanced = await repository.advanceRenewalSchedule(env, renewal, nextBillingDate);
      return advanced ? "rolled" : null;
    }
    // A removed account can never be charged, so this does not wait for a balance to change.
    if (renewal.accountArchived) return "archived";
    if (renewal.balanceMinor < renewal.amountMinor) return "uncovered";
    const charged = await repository.postRenewalCharge(env, renewal, nextBillingDate);
    return charged ? "charged" : null;
  }

  /** Records the one notification for this missed cycle and queues it for delivery. */
  async function notifyBlocked(
    env: Bindings,
    renewal: DueSubscriptionRenewal,
    reason: SubscriptionRenewalReason,
  ): Promise<boolean> {
    const id = crypto.randomUUID();
    const created = await repository.createRenewalNotification(env, {
      id,
      tenantId: renewal.tenantId,
      subscriptionId: renewal.id,
      dueDate: renewal.nextBillingDate,
      subscriptionName: renewal.name,
      amountMinor: renewal.amountMinor,
      accountName: renewal.accountName,
      reason,
    });
    if (!created) return false;

    const queued = await enqueueJob(env, {
      type: "subscription-renewal-notify",
      notificationId: id,
    });
    if (queued) return true;

    // Without a queue binding the first failed day still has to reach the user.
    const claimed = await repository.claimRenewalNotification(env, id);
    if (claimed) await deliver(env, claimed);
    return true;
  }

  return {
    async runDueRenewals(env, limit = SWEEP_LIMIT) {
      const today = manilaDate();
      const due = await repository.listDueRenewals(env, today, limit);
      const result: SubscriptionRenewalSweepResult = {
        checked: 0,
        charged: 0,
        rolled: 0,
        uncovered: 0,
        archived: 0,
        notified: 0,
        failed: 0,
      };

      for (const renewal of due) {
        result.checked += 1;
        try {
          const outcome = await settleRenewal(env, renewal);
          if (outcome === "charged") result.charged += 1;
          else if (outcome === "rolled") result.rolled += 1;
          else if (outcome === "uncovered") {
            result.uncovered += 1;
            await repository.markRenewalBlocked(env, renewal, "insufficient_balance");
            if (await notifyBlocked(env, renewal, "insufficient_balance")) result.notified += 1;
          } else if (outcome === "archived") {
            result.archived += 1;
            await repository.markRenewalBlocked(env, renewal, "account_archived");
            if (await notifyBlocked(env, renewal, "account_archived")) result.notified += 1;
          }
        } catch (error) {
          result.failed += 1;
          console.error(
            JSON.stringify({
              message: "Subscription renewal failed",
              subscriptionId: renewal.id,
              errorCode: error instanceof Error ? error.name : "unknown_error",
            }),
          );
        }
      }
      return result;
    },

    async retryNotification(env, notificationId) {
      const claimed = await repository.claimRenewalNotification(env, notificationId);
      if (!claimed) return false;
      return deliver(env, claimed);
    },

    async retryPendingNotifications(env, limit) {
      const claimed = await repository.claimPendingRenewalNotifications(env, limit);
      let sent = 0;
      for (const notification of claimed) {
        if (await deliver(env, notification)) sent += 1;
      }
      return { claimed: claimed.length, sent, failed: claimed.length - sent };
    },
  };
}

export const subscriptionRenewalService = createSubscriptionRenewalService();
