import { nextSubscriptionBillingDate } from "@zoption/shared";

import {
  subscriptionRepository,
  type DueSubscriptionRenewal,
  type SubscriptionRenewalNotification,
  type SubscriptionRepository,
} from "../db/subscriptions";
import { enqueueJob } from "../jobs";
import { createResendSender, ResendError } from "../resend";
import type { Bindings, EmailSender } from "../types";

const SWEEP_LIMIT = 100;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

/**
 * The address the account signs in with. Supabase owns it, so it is read at delivery time
 * instead of being mirrored into D1 where it would go stale after an address change.
 */
async function recipientAddress(
  env: Bindings,
  tenantId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const baseUrl = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !serviceRoleKey) return null;

  const owner = await env.DB.prepare(
    "SELECT user_id AS userId FROM user_tenants WHERE tenant_id = ? LIMIT 1",
  )
    .bind(tenantId)
    .first<{ userId: string }>();
  if (!owner?.userId) return null;

  const response = await fetcher(
    `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(owner.userId)}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) return null;

  const payload: unknown = await response.json().catch(() => null);
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const nested =
    typeof record.user === "object" && record.user !== null
      ? (record.user as Record<string, unknown>)
      : record;
  const email = typeof nested.email === "string" ? nested.email.trim() : "";
  return EMAIL_PATTERN.test(email) ? email : null;
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
  const subject = `Your ${name} subscription could not be renewed`;
  const text = [
    `Zoption could not renew your ${name} subscription.`,
    "",
    `Amount: ${amount}`,
    `Account: ${account}`,
    `Due date: ${dueDate}`,
    "",
    `${account} does not have enough balance to cover this charge, so no expense was recorded and your balance is unchanged. Zoption will try again every day and record the charge as soon as the account can cover it.`,
    "",
    ...(link ? [`Top up the account or change the subscription: ${link}`, ""] : []),
    "This is the only reminder for this missed renewal.",
  ].join("\n");
  const html = `<h1>${escapeHtml(name)} could not be renewed</h1>
<p><strong>Amount:</strong> ${escapeHtml(amount)}<br>
<strong>Account:</strong> ${escapeHtml(account)}<br>
<strong>Due date:</strong> ${escapeHtml(dueDate)}</p>
<p>${escapeHtml(account)} does not have enough balance to cover this charge, so no expense was recorded and your balance is unchanged. Zoption will try again every day and record the charge as soon as the account can cover it.</p>
${link ? `<p><a href="${escapeHtml(link)}">Top up the account or change the subscription</a></p>` : ""}
<p>This is the only reminder for this missed renewal.</p>`;
  return { to: recipient, from: senderAddress(env), subject, text, html };
}

function deliveryErrorCode(error: unknown): string {
  if (error instanceof ResendError) return `email_provider_${error.providerStatus}`;
  if (error instanceof Error && error.message.startsWith("subscription_")) return error.message;
  return "email_delivery_failed";
}

type RenewalOutcome = "charged" | "rolled" | "uncovered";

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
    if (renewal.balanceMinor < renewal.amountMinor) return "uncovered";
    const charged = await repository.postRenewalCharge(env, renewal, nextBillingDate);
    return charged ? "charged" : null;
  }

  /** Records the one notification for this missed cycle and queues it for delivery. */
  async function notifyUncovered(env: Bindings, renewal: DueSubscriptionRenewal): Promise<boolean> {
    const id = crypto.randomUUID();
    const created = await repository.createRenewalNotification(env, {
      id,
      tenantId: renewal.tenantId,
      subscriptionId: renewal.id,
      dueDate: renewal.nextBillingDate,
      subscriptionName: renewal.name,
      amountMinor: renewal.amountMinor,
      accountName: renewal.accountName,
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
            if (await notifyUncovered(env, renewal)) result.notified += 1;
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
