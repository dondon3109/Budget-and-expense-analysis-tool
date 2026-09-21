import type { Bindings } from "../types";

export type BugReportEgressOutcome = "clean" | "blocked";

export interface BugReportEgressAuditEntry {
  bugReportId: string;
  outcome: BugReportEgressOutcome;
  fieldsSent: string | readonly string[];
  redactedClasses: string | readonly string[];
  detectorHits: string | readonly string[];
  createdAt?: string;
}

export interface BugReportEgressAuditRecord {
  id: string;
  bugReportId: string;
  outcome: BugReportEgressOutcome;
  fieldsSent: string;
  redactedClasses: string;
  detectorHits: string;
  createdAt: string;
}

export interface BugReportEgressSummary {
  clean: number;
  blocked: number;
  total: number;
}

export interface BugReportEgressAuditRepository {
  record(env: Bindings, entry: BugReportEgressAuditEntry): Promise<BugReportEgressAuditRecord>;
  listForReport(env: Bindings, bugReportId: string): Promise<BugReportEgressAuditRecord[]>;
  findById(env: Bindings, id: string): Promise<BugReportEgressAuditRecord | null>;
  summarize(env: Bindings): Promise<BugReportEgressSummary>;
}

function toCommaJoined(value: string | readonly string[] | undefined | null): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.filter((token) => typeof token === "string" && token.length > 0).join(",");
  }
  return String(value);
}

export function splitCommaSeparated(value: string): string[] {
  if (!value) return [];
  return value.split(",").filter((token) => token.length > 0);
}

export const bugReportEgressAuditRepository: BugReportEgressAuditRepository = {
  async record(env, entry) {
    const id = crypto.randomUUID();
    const fieldsSent = toCommaJoined(entry.fieldsSent);
    const redactedClasses = toCommaJoined(entry.redactedClasses);
    const detectorHits = toCommaJoined(entry.detectorHits);
    const createdAt = entry.createdAt ?? new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO bug_report_egress_audit (
        id, bug_report_id, outcome, fields_sent, redacted_classes, detector_hits, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        entry.bugReportId,
        entry.outcome,
        fieldsSent,
        redactedClasses,
        detectorHits,
        createdAt,
      )
      .run();

    return {
      id,
      bugReportId: entry.bugReportId,
      outcome: entry.outcome,
      fieldsSent,
      redactedClasses,
      detectorHits,
      createdAt,
    };
  },

  async listForReport(env, bugReportId) {
    const result = await env.DB.prepare(
      `SELECT
        id,
        bug_report_id AS bugReportId,
        outcome,
        fields_sent AS fieldsSent,
        redacted_classes AS redactedClasses,
        detector_hits AS detectorHits,
        created_at AS createdAt
      FROM bug_report_egress_audit
      WHERE bug_report_id = ?
      ORDER BY created_at DESC`,
    )
      .bind(bugReportId)
      .all<BugReportEgressAuditRecord>();

    return result.results ?? [];
  },

  async findById(env, id) {
    const row = await env.DB.prepare(
      `SELECT
        id,
        bug_report_id AS bugReportId,
        outcome,
        fields_sent AS fieldsSent,
        redacted_classes AS redactedClasses,
        detector_hits AS detectorHits,
        created_at AS createdAt
      FROM bug_report_egress_audit
      WHERE id = ?`,
    )
      .bind(id)
      .first<BugReportEgressAuditRecord>();

    return row ?? null;
  },

  async summarize(env) {
    const row = await env.DB.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN outcome = 'clean' THEN 1 ELSE 0 END), 0) AS clean,
        COALESCE(SUM(CASE WHEN outcome = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
        COUNT(*) AS total
      FROM bug_report_egress_audit`,
    ).first<{ clean: number; blocked: number; total: number }>();

    return {
      clean: Number(row?.clean ?? 0),
      blocked: Number(row?.blocked ?? 0),
      total: Number(row?.total ?? 0),
    };
  },
};
