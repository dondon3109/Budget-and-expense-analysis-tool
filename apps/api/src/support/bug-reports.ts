import type {
  AdminBugReport,
  BugReport,
  BugReportCreateInput,
  BugReportStatus,
} from "@zoption/shared";

import { bugReportRepository, type BugReportRepository } from "../db/bug-reports";
import { HttpError } from "../errors";
import { createResendSender, ResendError } from "../resend";
import type { AuthUser, Bindings, EmailSender } from "../types";

const CLOSED_REPORT_RETENTION_DAYS = 180;

export interface BugReportService {
  create(
    env: Bindings,
    tenantId: string,
    user: AuthUser,
    input: BugReportCreateInput,
  ): Promise<BugReport>;
  listForReporter(env: Bindings, tenantId: string): Promise<BugReport[]>;
  getForReporter(env: Bindings, tenantId: string, id: string): Promise<BugReport>;
  listForAdmin(env: Bindings): Promise<AdminBugReport[]>;
  updateStatus(env: Bindings, id: string, status: BugReportStatus): Promise<AdminBugReport>;
  retryPendingNotifications(
    env: Bindings,
    limit: number,
  ): Promise<{ claimed: number; sent: number; failed: number }>;
  cleanupExpired(env: Bindings, limit: number): Promise<number>;
}

function reportReference(id: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `BR-${date}-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function reporterView(report: AdminBugReport): BugReport {
  return {
    id: report.id,
    reference: report.reference,
    title: report.title,
    category: report.category,
    actualBehavior: report.actualBehavior,
    expectedBehavior: report.expectedBehavior,
    stepsToReproduce: report.stepsToReproduce,
    frequency: report.frequency,
    pageContext: report.pageContext,
    diagnostics: report.diagnostics,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function supportRecipient(env: Bindings): string {
  return env.BUG_REPORT_TO?.trim() || "support@zoption.site";
}

function configuredSender(env: Bindings, injected?: EmailSender): EmailSender {
  if (injected) return injected;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("bug_report_email_not_configured");
  return createResendSender(apiKey);
}

function senderAddress(env: Bindings): { email: string; name: string } {
  const email = env.EMAIL_FROM?.trim();
  if (!email) throw new Error("bug_report_sender_not_configured");
  return { email, name: "Zoption" };
}

function adminReportUrl(env: Bindings, report: AdminBugReport): string | null {
  const configured = env.WEB_APP_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL("/app/support/reports", configured);
    url.searchParams.set("report", report.id);
    url.searchParams.set("view", "admin");
    return url.href;
  } catch {
    return null;
  }
}

function emailMessage(env: Bindings, report: AdminBugReport) {
  const link = adminReportUrl(env, report);
  const diagnostics = report.diagnostics;
  const text = [
    `${report.reference}: ${report.title}`,
    "",
    `Category: ${report.category}`,
    `Page: ${report.pageContext} (${diagnostics.route})`,
    `Frequency: ${report.frequency}`,
    `Release: ${diagnostics.releaseVersion}`,
    `Environment: ${diagnostics.platform}, ${diagnostics.displayMode}, ${diagnostics.viewportWidth}x${diagnostics.viewportHeight}`,
    report.reporterEmail
      ? `Reporter: ${report.reporterEmail}`
      : `Reporter ID: ${report.reporterUserId}`,
    "",
    "What happened:",
    report.actualBehavior,
    "",
    "Expected behavior:",
    report.expectedBehavior,
    "",
    "Steps to reproduce:",
    report.stepsToReproduce,
    ...(link ? ["", `Open the admin report: ${link}`] : []),
  ].join("\n");
  const html = `<h1>${escapeHtml(report.reference)}: ${escapeHtml(report.title)}</h1>
<p><strong>Category:</strong> ${escapeHtml(report.category)}<br>
<strong>Page:</strong> ${escapeHtml(report.pageContext)} (${escapeHtml(diagnostics.route)})<br>
<strong>Frequency:</strong> ${escapeHtml(report.frequency)}<br>
<strong>Release:</strong> ${escapeHtml(diagnostics.releaseVersion)}<br>
<strong>Environment:</strong> ${escapeHtml(`${diagnostics.platform}, ${diagnostics.displayMode}, ${diagnostics.viewportWidth}x${diagnostics.viewportHeight}`)}<br>
<strong>Reporter:</strong> ${escapeHtml(report.reporterEmail ?? report.reporterUserId)}</p>
<h2>What happened</h2><p>${escapeHtml(report.actualBehavior).replaceAll("\n", "<br>")}</p>
<h2>Expected behavior</h2><p>${escapeHtml(report.expectedBehavior).replaceAll("\n", "<br>")}</p>
<h2>Steps to reproduce</h2><p>${escapeHtml(report.stepsToReproduce).replaceAll("\n", "<br>")}</p>
${link ? `<p><a href="${escapeHtml(link)}">Open the admin report</a></p>` : ""}`;
  return {
    to: supportRecipient(env),
    from: senderAddress(env),
    subject: `[Zoption bug] ${report.reference} · ${report.pageContext}`,
    text,
    html,
  };
}

function notificationErrorCode(error: unknown): string {
  if (error instanceof ResendError) return `email_provider_${error.providerStatus}`;
  if (error instanceof Error && error.message.startsWith("bug_report_")) return error.message;
  return "email_delivery_failed";
}

export function createBugReportService(
  repository: BugReportRepository = bugReportRepository,
  injectedSender?: EmailSender,
): BugReportService {
  async function deliver(env: Bindings, report: AdminBugReport): Promise<boolean> {
    try {
      await configuredSender(env, injectedSender).send(emailMessage(env, report));
      await repository.finishNotification(env, report.id, "sent");
      return true;
    } catch (error) {
      await repository.finishNotification(env, report.id, "failed", notificationErrorCode(error));
      return false;
    }
  }

  return {
    async create(env, tenantId, user, input) {
      const id = crypto.randomUUID();
      const result = await repository.create(env, {
        id,
        reference: reportReference(id),
        tenantId,
        reporterUserId: user.id,
        reporterEmail: user.email?.trim().toLocaleLowerCase("en-US") || null,
        input,
      });
      if (result.created) {
        const claimed = await repository.claimNotification(env, result.report.id);
        if (claimed) await deliver(env, claimed);
      }
      return reporterView(result.report);
    },

    listForReporter(env, tenantId) {
      return repository.listForTenant(env, tenantId, 50);
    },

    async getForReporter(env, tenantId, id) {
      const report = await repository.findForTenant(env, tenantId, id);
      if (!report) throw new HttpError(404, "bug_report_not_found", "Bug report not found.");
      return report;
    },

    listForAdmin(env) {
      return repository.listAll(env, 100);
    },

    async updateStatus(env, id, status) {
      const report = await repository.updateStatus(env, id, status);
      if (!report) throw new HttpError(404, "bug_report_not_found", "Bug report not found.");
      return report;
    },

    async retryPendingNotifications(env, limit) {
      const claimed = await repository.claimPendingNotifications(env, limit);
      let sent = 0;
      for (const report of claimed) if (await deliver(env, report)) sent += 1;
      return { claimed: claimed.length, sent, failed: claimed.length - sent };
    },

    cleanupExpired(env, limit) {
      const cutoff = new Date(
        Date.now() - CLOSED_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ).toISOString();
      return repository.cleanupExpired(env, cutoff, limit);
    },
  };
}

export const bugReportService = createBugReportService();
