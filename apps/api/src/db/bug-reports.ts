import {
  bugReportDiagnosticsSchema,
  type AdminBugReport,
  type BugReport,
  type BugReportCreateInput,
  type BugReportNotificationStatus,
  type BugReportStatus,
} from "@zoption/shared";

import type { Bindings } from "../types";

interface BugReportRow {
  id: string;
  reference: string;
  reporterUserId: string;
  reporterEmail: string | null;
  title: string;
  category: AdminBugReport["category"];
  actualBehavior: string;
  expectedBehavior: string;
  stepsToReproduce: string;
  frequency: AdminBugReport["frequency"];
  pageContext: AdminBugReport["pageContext"];
  diagnosticsJson: string;
  status: BugReportStatus;
  notificationStatus: BugReportNotificationStatus;
  notificationAttempts: number;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugReportCreateRecord {
  id: string;
  reference: string;
  tenantId: string;
  reporterUserId: string;
  reporterEmail: string | null;
  input: BugReportCreateInput;
}

export interface BugReportCreateResult {
  report: AdminBugReport;
  created: boolean;
}

export interface BugReportRepository {
  create(env: Bindings, record: BugReportCreateRecord): Promise<BugReportCreateResult>;
  listForTenant(env: Bindings, tenantId: string, limit: number): Promise<BugReport[]>;
  findForTenant(env: Bindings, tenantId: string, id: string): Promise<BugReport | null>;
  listAll(env: Bindings, limit: number): Promise<AdminBugReport[]>;
  updateStatus(env: Bindings, id: string, status: BugReportStatus): Promise<AdminBugReport | null>;
  claimNotification(env: Bindings, id: string): Promise<AdminBugReport | null>;
  claimPendingNotifications(env: Bindings, limit: number): Promise<AdminBugReport[]>;
  finishNotification(
    env: Bindings,
    id: string,
    status: "sent" | "failed",
    errorCode?: string,
  ): Promise<void>;
  cleanupExpired(env: Bindings, cutoff: string, limit: number): Promise<number>;
}

const selectColumns = `
  id, reference, reporter_user_id AS reporterUserId, reporter_email AS reporterEmail,
  title, category, actual_behavior AS actualBehavior, expected_behavior AS expectedBehavior,
  steps_to_reproduce AS stepsToReproduce, frequency, page_context AS pageContext,
  diagnostics_json AS diagnosticsJson, status,
  notification_status AS notificationStatus,
  notification_attempts AS notificationAttempts, notified_at AS notifiedAt,
  created_at AS createdAt, updated_at AS updatedAt`;

function toAdminReport(row: BugReportRow): AdminBugReport {
  return {
    id: row.id,
    reference: row.reference,
    reporterUserId: row.reporterUserId,
    reporterEmail: row.reporterEmail,
    title: row.title,
    category: row.category,
    actualBehavior: row.actualBehavior,
    expectedBehavior: row.expectedBehavior,
    stepsToReproduce: row.stepsToReproduce,
    frequency: row.frequency,
    pageContext: row.pageContext,
    diagnostics: bugReportDiagnosticsSchema.parse(JSON.parse(row.diagnosticsJson) as unknown),
    status: row.status,
    notificationStatus: row.notificationStatus,
    notificationAttempts: row.notificationAttempts,
    notifiedAt: row.notifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReporterReport(report: AdminBugReport): BugReport {
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

async function findAdminReport(env: Bindings, id: string): Promise<AdminBugReport | null> {
  const row = await env.DB.prepare(`SELECT ${selectColumns} FROM bug_reports WHERE id = ?`)
    .bind(id)
    .first<BugReportRow>();
  return row ? toAdminReport(row) : null;
}

function notificationLease(): string {
  return new Date(Date.now() + 10 * 60 * 1_000).toISOString();
}

export const bugReportRepository: BugReportRepository = {
  async create(env, record) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO bug_reports
       (id, reference, tenant_id, reporter_user_id, reporter_email, client_request_id,
        title, category, actual_behavior, expected_behavior, steps_to_reproduce,
        frequency, page_context, diagnostics_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        record.id,
        record.reference,
        record.tenantId,
        record.reporterUserId,
        record.reporterEmail,
        record.input.clientRequestId,
        record.input.title,
        record.input.category,
        record.input.actualBehavior,
        record.input.expectedBehavior,
        record.input.stepsToReproduce,
        record.input.frequency,
        record.input.pageContext,
        JSON.stringify(record.input.diagnostics),
      )
      .run();

    const row = await env.DB.prepare(
      `SELECT ${selectColumns}
       FROM bug_reports WHERE tenant_id = ? AND client_request_id = ?`,
    )
      .bind(record.tenantId, record.input.clientRequestId)
      .first<BugReportRow>();
    if (!row) throw new Error("The bug report could not be stored.");
    return { report: toAdminReport(row), created: (result.meta.changes ?? 0) > 0 };
  },

  async listForTenant(env, tenantId, limit) {
    const rows = await env.DB.prepare(
      `SELECT ${selectColumns}
       FROM bug_reports WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(tenantId, limit)
      .all<BugReportRow>();
    return rows.results.map((row) => toReporterReport(toAdminReport(row)));
  },

  async findForTenant(env, tenantId, id) {
    const row = await env.DB.prepare(
      `SELECT ${selectColumns} FROM bug_reports WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, id)
      .first<BugReportRow>();
    return row ? toReporterReport(toAdminReport(row)) : null;
  },

  async listAll(env, limit) {
    const rows = await env.DB.prepare(
      `SELECT ${selectColumns} FROM bug_reports ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(limit)
      .all<BugReportRow>();
    return rows.results.map(toAdminReport);
  },

  async updateStatus(env, id, status) {
    const result = await env.DB.prepare(
      `UPDATE bug_reports SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(status, id)
      .run();
    if ((result.meta.changes ?? 0) === 0) return null;
    return findAdminReport(env, id);
  },

  async claimNotification(env, id) {
    const result = await env.DB.prepare(
      `UPDATE bug_reports
       SET notification_status = 'pending', notification_attempts = notification_attempts + 1,
           notification_lease_until = ?, last_notification_error_code = NULL
       WHERE id = ? AND notification_status != 'sent'
         AND notification_attempts < 8
         AND (notification_lease_until IS NULL OR notification_lease_until < ?)`,
    )
      .bind(notificationLease(), id, new Date().toISOString())
      .run();
    if ((result.meta.changes ?? 0) === 0) return null;
    return findAdminReport(env, id);
  },

  async claimPendingNotifications(env, limit) {
    const now = new Date().toISOString();
    const rows = await env.DB.prepare(
      `SELECT id FROM bug_reports
       WHERE notification_status != 'sent' AND notification_attempts < 8
         AND (notification_lease_until IS NULL OR notification_lease_until < ?)
       ORDER BY created_at LIMIT ?`,
    )
      .bind(now, limit)
      .all<{ id: string }>();

    const claimed: AdminBugReport[] = [];
    for (const row of rows.results) {
      const report = await this.claimNotification(env, row.id);
      if (report) claimed.push(report);
    }
    return claimed;
  },

  async finishNotification(env, id, status, errorCode) {
    await env.DB.prepare(
      `UPDATE bug_reports
       SET notification_status = ?, notification_lease_until = NULL,
           last_notification_error_code = ?,
           notified_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE notified_at END
       WHERE id = ?`,
    )
      .bind(status, errorCode ?? null, status, id)
      .run();
  },

  async cleanupExpired(env, cutoff, limit) {
    const result = await env.DB.prepare(
      `DELETE FROM bug_reports WHERE id IN (
         SELECT id FROM bug_reports
         WHERE status IN ('resolved', 'closed', 'duplicate') AND updated_at < ?
         ORDER BY updated_at LIMIT ?
       )`,
    )
      .bind(cutoff, limit)
      .run();
    return result.meta.changes ?? 0;
  },
};
