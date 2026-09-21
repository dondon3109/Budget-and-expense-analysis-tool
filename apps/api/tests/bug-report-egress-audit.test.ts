import { redactBugReport } from "@zoption/shared";
import { afterEach, describe, expect, it } from "vitest";

import {
  bugReportEgressAuditRepository,
  type BugReportEgressAuditEntry,
} from "../src/db/bug-report-egress-audit";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

type TestDatabase = ReturnType<typeof createD1TestDatabase>["database"];

const databases: TestDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function environment(): { env: Bindings; database: TestDatabase } {
  const d1 = createD1TestDatabase();
  databases.push(d1.database);
  return { env: { DB: d1.binding } as Bindings, database: d1.database };
}

describe("bug report egress audit repository", () => {
  it("reads back a recorded clean entry with every field intact", async () => {
    const { env } = environment();
    const entry: BugReportEgressAuditEntry = {
      bugReportId: "report-clean-123",
      outcome: "clean",
      fieldsSent: ["title", "actualBehavior", "expectedBehavior", "stepsToReproduce"],
      redactedClasses: ["money", "card", "email"],
      detectorHits: [],
      createdAt: "2026-09-20T10:15:30.000Z",
    };

    const recorded = await bugReportEgressAuditRepository.record(env, entry);

    expect(recorded.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(recorded.bugReportId).toBe("report-clean-123");
    expect(recorded.outcome).toBe("clean");
    expect(recorded.fieldsSent).toBe("title,actualBehavior,expectedBehavior,stepsToReproduce");
    expect(recorded.redactedClasses).toBe("money,card,email");
    expect(recorded.detectorHits).toBe("");
    expect(recorded.createdAt).toBe("2026-09-20T10:15:30.000Z");

    const foundById = await bugReportEgressAuditRepository.findById(env, recorded.id);
    expect(foundById).toEqual(recorded);

    const list = await bugReportEgressAuditRepository.listForReport(env, "report-clean-123");
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(recorded);
  });

  it("reads back a recorded blocked entry with outcome === 'blocked' and text-less metadata", async () => {
    const { env, database } = environment();
    const entry: BugReportEgressAuditEntry = {
      bugReportId: "report-blocked-456",
      outcome: "blocked",
      fieldsSent: [],
      redactedClasses: ["secret_key", "internal_token"],
      detectorHits: ["secret_key"],
      createdAt: "2026-09-20T11:00:00.000Z",
    };

    const recorded = await bugReportEgressAuditRepository.record(env, entry);
    expect(recorded.outcome).toBe("blocked");
    expect(recorded.fieldsSent).toBe("");
    expect(recorded.redactedClasses).toBe("secret_key,internal_token");
    expect(recorded.detectorHits).toBe("secret_key");

    const list = await bugReportEgressAuditRepository.listForReport(env, "report-blocked-456");
    expect(list).toHaveLength(1);
    const fromList = list[0]!;
    expect(fromList.outcome).toBe("blocked");
    expect(fromList.fieldsSent).toBe("");
    expect(fromList.redactedClasses).toBe("secret_key,internal_token");
    expect(fromList.detectorHits).toBe("secret_key");
    expect(fromList).not.toHaveProperty("text");
    expect((fromList as unknown as Record<string, unknown>).text).toBeUndefined();

    // Verify directly on the SQLite database row that no text or payload column exists
    const rawRow = database
      .prepare("SELECT * FROM bug_report_egress_audit WHERE id = ?")
      .get(recorded.id) as Record<string, unknown>;

    expect(rawRow).toBeDefined();
    expect(rawRow.outcome).toBe("blocked");
    expect(rawRow).not.toHaveProperty("text");
    expect(rawRow).not.toHaveProperty("body");
    expect(rawRow).not.toHaveProperty("raw_text");
    expect(rawRow).not.toHaveProperty("redacted_text");
  });

  it("returns entries newest first in listForReport", async () => {
    const { env } = environment();
    const reportId = "report-history-789";
    const otherReportId = "report-unrelated";

    await bugReportEgressAuditRepository.record(env, {
      bugReportId: reportId,
      outcome: "blocked",
      fieldsSent: "",
      redactedClasses: "phone",
      detectorHits: "phone",
      createdAt: "2026-09-20T08:00:00.000Z",
    });

    await bugReportEgressAuditRepository.record(env, {
      bugReportId: reportId,
      outcome: "clean",
      fieldsSent: "title,actualBehavior",
      redactedClasses: "phone",
      detectorHits: "",
      createdAt: "2026-09-20T12:00:00.000Z",
    });

    await bugReportEgressAuditRepository.record(env, {
      bugReportId: reportId,
      outcome: "clean",
      fieldsSent: "title",
      redactedClasses: "",
      detectorHits: "",
      createdAt: "2026-09-20T10:00:00.000Z",
    });

    await bugReportEgressAuditRepository.record(env, {
      bugReportId: otherReportId,
      outcome: "clean",
      fieldsSent: "title",
      redactedClasses: "",
      detectorHits: "",
      createdAt: "2026-09-20T13:00:00.000Z",
    });

    const entries = await bugReportEgressAuditRepository.listForReport(env, reportId);
    expect(entries).toHaveLength(3);
    expect(entries.map((item) => item.createdAt)).toEqual([
      "2026-09-20T12:00:00.000Z",
      "2026-09-20T10:00:00.000Z",
      "2026-09-20T08:00:00.000Z",
    ]);
    expect(entries.every((item) => item.bugReportId === reportId)).toBe(true);
  });

  it("summarizes counts per outcome correctly", async () => {
    const { env } = environment();

    const emptySummary = await bugReportEgressAuditRepository.summarize(env);
    expect(emptySummary).toEqual({ clean: 0, blocked: 0, total: 0 });

    await bugReportEgressAuditRepository.record(env, {
      bugReportId: "report-1",
      outcome: "clean",
      fieldsSent: "title",
      redactedClasses: "",
      detectorHits: "",
    });
    await bugReportEgressAuditRepository.record(env, {
      bugReportId: "report-2",
      outcome: "clean",
      fieldsSent: "title",
      redactedClasses: "",
      detectorHits: "",
    });
    await bugReportEgressAuditRepository.record(env, {
      bugReportId: "report-3",
      outcome: "blocked",
      fieldsSent: "",
      redactedClasses: "apiKey",
      detectorHits: "apiKey",
    });

    const populatedSummary = await bugReportEgressAuditRepository.summarize(env);
    expect(populatedSummary).toEqual({ clean: 2, blocked: 1, total: 3 });
  });

  it("rejects invalid outcomes via the CHECK constraint and throws on insert", async () => {
    const { env, database } = environment();

    // Rejection via repository insert
    await expect(
      bugReportEgressAuditRepository.record(env, {
        bugReportId: "report-1",
        outcome: "pending" as any,
        fieldsSent: "",
        redactedClasses: "",
        detectorHits: "",
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await expect(
      bugReportEgressAuditRepository.record(env, {
        bugReportId: "report-1",
        outcome: "failed" as any,
        fieldsSent: "",
        redactedClasses: "",
        detectorHits: "",
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    await expect(
      bugReportEgressAuditRepository.record(env, {
        bugReportId: "report-1",
        outcome: "CLEAN" as any,
        fieldsSent: "",
        redactedClasses: "",
        detectorHits: "",
      }),
    ).rejects.toThrow(/CHECK constraint failed/);

    // Rejection via direct raw SQLite insert to prove the DB constraint is active
    expect(() =>
      database
        .prepare(
          `INSERT INTO bug_report_egress_audit
           (id, bug_report_id, outcome, fields_sent, redacted_classes, detector_hits, created_at)
           VALUES ('manual-1', 'report-1', 'unknown_status', '', '', '', '2026-09-20T10:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("stores no user-authored report content in the database row", async () => {
    const { env, database } = environment();

    const canaryTitle = "CANARY_USER_TITLE_PRIVATE_INVESTIGATION";
    const canaryActual = "CANARY_SENSITIVE_ACCOUNT_NUMBER_77889900";
    const canaryExpected = "CANARY_EXPECTED_SECRET_STATE";
    const canarySteps = "CANARY_STEPS_PASSWORD_ADMIN_123";
    const canaryEmail = "canary_user_email@example.org";

    const userFields = {
      title: `${canaryTitle} with card 4111-2222-3333-4444`,
      actualBehavior: `${canaryActual} error occurred`,
      expectedBehavior: `${canaryExpected} should show balance`,
      stepsToReproduce: `${canarySteps} with email ${canaryEmail}`,
    };

    const redactionOutcome = redactBugReport(userFields);

    const record = await bugReportEgressAuditRepository.record(env, {
      bugReportId: "report-canary-test",
      outcome: redactionOutcome.status,
      fieldsSent:
        redactionOutcome.status === "clean"
          ? ["title", "actualBehavior", "expectedBehavior", "stepsToReproduce"]
          : [],
      redactedClasses: redactionOutcome.redacted,
      detectorHits: redactionOutcome.detectorHits,
    });

    const rawRow = database
      .prepare("SELECT * FROM bug_report_egress_audit WHERE id = ?")
      .get(record.id) as Record<string, unknown>;

    expect(rawRow).toBeDefined();

    // Verify row keys strictly match the defined audit schema
    const keys = Object.keys(rawRow).sort();
    expect(keys).toEqual([
      "bug_report_id",
      "created_at",
      "detector_hits",
      "fields_sent",
      "id",
      "outcome",
      "redacted_classes",
    ]);

    // Inspect all row values combined
    const concatenatedValues = Object.values(rawRow)
      .map((val) => String(val))
      .join(" ");

    // Must not contain any user-authored canary text or substrings
    expect(concatenatedValues).not.toContain(canaryTitle);
    expect(concatenatedValues).not.toContain(canaryActual);
    expect(concatenatedValues).not.toContain(canaryExpected);
    expect(concatenatedValues).not.toContain(canarySteps);
    expect(concatenatedValues).not.toContain(canaryEmail);
    expect(concatenatedValues).not.toContain("4111");
    expect(concatenatedValues).not.toContain("77889900");
    expect(concatenatedValues).not.toContain("ADMIN_123");
    expect(concatenatedValues).not.toContain("INVESTIGATION");
  });
});
