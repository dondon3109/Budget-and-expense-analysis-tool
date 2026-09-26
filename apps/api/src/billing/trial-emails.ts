import { escapeHtml, recipientAddress } from "../account-email";
import { getProEntitlementSource } from "../db/billing";
import { PRO_TRIAL_DAYS } from "../db/tenants";
import { createResendSender, ResendError } from "../resend";
import type { Bindings, EmailSender } from "../types";

/**
 * A stage that keeps failing is given up after this many five-minute attempts (about an hour),
 * so a provider outage costs at most that one email, never the later stages.
 */
const MAX_STAGE_FAILURES = 12;
const ENDING_NOTICE_MS = 24 * 60 * 60 * 1_000;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "Asia/Manila",
});

export type TrialEmailKind = "started" | "ending" | "ended";

interface PendingTrialRow {
  tenantId: string;
  endsAt: string;
  startedEmailAt: string | null;
  endingEmailAt: string | null;
}

export interface TrialEmailSweepResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

const EMAIL_COLUMN: Record<TrialEmailKind, string> = {
  started: "started_email_at",
  ending: "ending_email_at",
  ended: "ended_email_at",
};

/**
 * The one email a trial is due now. Only the latest stage is sent, so a workspace that missed
 * the start email (or its trial began before this shipped) is not sent a stale one.
 */
export function dueTrialEmail(row: PendingTrialRow, now: Date): TrialEmailKind | null {
  const endsAt = new Date(row.endsAt).getTime();
  if (now.getTime() >= endsAt) return "ended";
  if (now.getTime() >= endsAt - ENDING_NOTICE_MS) return row.endingEmailAt ? null : "ending";
  return row.startedEmailAt ? null : "started";
}

function billingUrl(env: Bindings): string | null {
  const configured = env.WEB_APP_URL?.trim();
  if (!configured) return null;
  try {
    return new URL("/app/settings", configured).href;
  } catch {
    return null;
  }
}

function trialMessage(env: Bindings, kind: TrialEmailKind, endsAt: string, recipient: string) {
  const endDate = dateFormatter.format(new Date(endsAt));
  const link = billingUrl(env);
  const copy = {
    started: {
      subject: `Your ${PRO_TRIAL_DAYS}-day Zoption Pro trial has started`,
      heading: "Your Zoption Pro trial has started",
      body: `You have Zoption Pro free until ${endDate}: higher AI and import limits, unlimited custom categories, and advanced management and analytics. No card or payment setup is needed, and nothing is charged when the trial ends.`,
      action: "See your plan",
    },
    ending: {
      subject: "Your Zoption Pro trial ends tomorrow",
      heading: "Your Zoption Pro trial ends tomorrow",
      body: `Your trial ends on ${endDate}. After that your workspace moves to the Free plan automatically, and nothing is charged. Your data stays exactly where it is. Subscribe any time to keep Pro.`,
      action: "Keep Zoption Pro",
    },
    ended: {
      subject: "Your Zoption Pro trial has ended",
      heading: "Your Zoption Pro trial has ended",
      body: "Your workspace is now on the Free plan. Nothing was charged, and all your data is still here. Subscribe any time to get Pro limits and capabilities back.",
      action: "Upgrade to Zoption Pro",
    },
  }[kind];
  const text = [copy.body, "", ...(link ? [`${copy.action}: ${link}`] : [])].join("\n");
  const html = `<h1>${escapeHtml(copy.heading)}</h1>
<p>${escapeHtml(copy.body)}</p>
${link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action)}</a></p>` : ""}`;
  const from = env.EMAIL_FROM?.trim();
  if (!from) throw new Error("trial_sender_not_configured");
  return {
    to: recipient,
    from: { email: from, name: "Zoption" },
    subject: copy.subject,
    text,
    html,
  };
}

function configuredSender(env: Bindings, injected?: EmailSender): EmailSender {
  if (injected) return injected;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("trial_email_not_configured");
  return createResendSender(apiKey);
}

/**
 * Stamps this stage and every earlier one, so skipped stale stages are never sent later. The
 * `IS NULL` guard makes the claim atomic when two cron runs overlap.
 */
async function claim(
  env: Bindings,
  tenantId: string,
  kind: TrialEmailKind,
  now: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE pro_trials
     SET started_email_at = COALESCE(started_email_at, ?1),
         ending_email_at = CASE WHEN ?2 = 'started' THEN ending_email_at
                                ELSE COALESCE(ending_email_at, ?1) END,
         ended_email_at = CASE WHEN ?2 = 'ended' THEN ?1 ELSE ended_email_at END
     WHERE tenant_id = ?3 AND ${EMAIL_COLUMN[kind]} IS NULL`,
  )
    .bind(now, kind, tenantId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Reopens a failed stage for the next run, or gives it up once it has failed too often. */
async function release(env: Bindings, tenantId: string, kind: TrialEmailKind): Promise<void> {
  const column = EMAIL_COLUMN[kind];
  await env.DB.prepare(
    `UPDATE pro_trials
     SET ${column} = CASE WHEN email_failures + 1 >= ?1 THEN ${column} ELSE NULL END,
         email_failures = CASE WHEN email_failures + 1 >= ?1 THEN 0 ELSE email_failures + 1 END
     WHERE tenant_id = ?2`,
  )
    .bind(MAX_STAGE_FAILURES, tenantId)
    .run();
}

async function resetFailures(env: Bindings, tenantId: string): Promise<void> {
  await env.DB.prepare("UPDATE pro_trials SET email_failures = 0 WHERE tenant_id = ?")
    .bind(tenantId)
    .run();
}

/**
 * Missing configuration is not a delivery failure: the sweep waits for it instead of spending
 * every trial's attempts.
 */
function emailConfigured(env: Bindings, injectedSender?: EmailSender): boolean {
  return Boolean(
    (injectedSender || env.RESEND_API_KEY?.trim()) &&
    env.EMAIL_FROM?.trim() &&
    env.SUPABASE_URL?.trim() &&
    env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function errorCode(error: unknown): string {
  if (error instanceof ResendError) return `email_provider_${error.providerStatus}`;
  if (error instanceof Error && error.message.startsWith("trial_")) return error.message;
  return "email_delivery_failed";
}

export function createTrialEmailService(
  injected: { sender?: EmailSender; fetcher?: typeof fetch } = {},
) {
  return {
    async sendDue(env: Bindings, limit: number, now = new Date()): Promise<TrialEmailSweepResult> {
      const result: TrialEmailSweepResult = { checked: 0, sent: 0, skipped: 0, failed: 0 };
      if (!emailConfigured(env, injected.sender)) return result;

      const nowIso = now.toISOString();
      // Select only rows with a stage due now, so rows already handled never fill the limit.
      const { results } = await env.DB.prepare(
        `SELECT tenant_id AS tenantId, ends_at AS endsAt,
                started_email_at AS startedEmailAt, ending_email_at AS endingEmailAt
         FROM pro_trials
         WHERE ended_email_at IS NULL
           AND (
             (started_email_at IS NULL AND datetime(ends_at, '-1 day') > datetime(?1))
             OR (ending_email_at IS NULL AND datetime(ends_at, '-1 day') <= datetime(?1)
                 AND datetime(ends_at) > datetime(?1))
             OR datetime(ends_at) <= datetime(?1)
           )
         ORDER BY ends_at
         LIMIT ?2`,
      )
        .bind(nowIso, limit)
        .all<PendingTrialRow>();

      for (const row of results) {
        const kind = dueTrialEmail(row, now);
        if (!kind) continue;
        result.checked += 1;
        if (!(await claim(env, row.tenantId, kind, nowIso))) continue;

        // A workspace that subscribed (or was granted Pro) needs no trial reminders.
        const source = await getProEntitlementSource(env, row.tenantId);
        if (source !== null && source !== "trial") {
          await claim(env, row.tenantId, "ended", nowIso);
          result.skipped += 1;
          continue;
        }

        try {
          const recipient = await recipientAddress(env, row.tenantId, injected.fetcher);
          if (!recipient) throw new Error("trial_recipient_unavailable");
          await configuredSender(env, injected.sender).send(
            trialMessage(env, kind, row.endsAt, recipient),
          );
          await resetFailures(env, row.tenantId);
          result.sent += 1;
        } catch (error) {
          await release(env, row.tenantId, kind);
          result.failed += 1;
          console.error(
            JSON.stringify({
              message: "Trial email failed",
              kind,
              errorCode: errorCode(error),
            }),
          );
        }
      }
      return result;
    },
  };
}

export const trialEmailService = createTrialEmailService();
