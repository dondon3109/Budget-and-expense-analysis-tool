import { redactBugReport, type BugReportFields } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import {
  bugReportEgressAuditRepository,
  type BugReportEgressAuditRecord,
} from "../src/db/bug-report-egress-audit";
import { bugReportRepository } from "../src/db/bug-reports";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

type TestDatabase = ReturnType<typeof createD1TestDatabase>["database"];

const databases: TestDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const OPS_TOKEN = "test-ops-egress-bearer-token-123456789";

function setupTestEnvironment() {
  const d1 = createD1TestDatabase();
  databases.push(d1.database);

  d1.database
    .prepare("INSERT OR IGNORE INTO tenants (id, kind, name) VALUES (?, ?, ?)")
    .run("tenant-ops-test", "user", "Ops Test Tenant");

  const env: Bindings = {
    DB: d1.binding,
    OPS_EGRESS_TOKEN: OPS_TOKEN,
  };

  return { env, database: d1.database };
}

function seedBugReport(
  database: TestDatabase,
  report: {
    id?: string;
    reference?: string;
    tenantId?: string;
    reporterUserId?: string;
    reporterEmail?: string | null;
    title: string;
    category?: string;
    actualBehavior: string;
    expectedBehavior: string;
    stepsToReproduce: string;
    frequency?: string;
    pageContext?: string;
    diagnosticsJson?: string;
  },
) {
  const id = report.id ?? crypto.randomUUID();
  const reference = report.reference ?? `BR-${Date.now()}-${id.slice(0, 8)}`;
  const tenantId = report.tenantId ?? "tenant-ops-test";
  const reporterUserId = report.reporterUserId ?? "user-123";
  const reporterEmail =
    report.reporterEmail !== undefined ? report.reporterEmail : "reporter@example.com";
  const category = report.category ?? "ui";
  const frequency = report.frequency ?? "always";
  const pageContext = report.pageContext ?? "dashboard";
  const diagnosticsJson =
    report.diagnosticsJson ??
    JSON.stringify({
      route: "/app/dashboard",
      releaseVersion: "1.0.0",
      platform: "desktop",
      displayMode: "browser",
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

  database
    .prepare(
      `INSERT INTO bug_reports (
        id, reference, tenant_id, reporter_user_id, reporter_email, client_request_id,
        title, category, actual_behavior, expected_behavior, steps_to_reproduce,
        frequency, page_context, diagnostics_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      reference,
      tenantId,
      reporterUserId,
      reporterEmail,
      crypto.randomUUID(),
      report.title,
      category,
      report.actualBehavior,
      report.expectedBehavior,
      report.stepsToReproduce,
      frequency,
      pageContext,
      diagnosticsJson,
    );

  return { id, reference };
}

describe("ops bug report egress endpoint (/api/ops/bug-reports)", () => {
  it("1. returns 200 with valid bearer token and payload containing redacted text", async () => {
    const { env, database } = setupTestEnvironment();

    const { id: reportId } = seedBugReport(database, {
      title: "Clean bug report with sensitive money and phone",
      actualBehavior: "User sent to Juan Dela Cruz failed with ₱1,200.00 charge",
      expectedBehavior: "Expected success receipt and SMS to 0917 123 4567",
      stepsToReproduce: "Open transfer dialog and submit",
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      reports: Array<{
        id: string;
        createdAt: string;
        text: string;
        fields: string[];
        redactedClasses: string[];
      }>;
      blocked: Array<{
        id: string;
        createdAt: string;
        detectorHits: string[];
      }>;
      counts: { clean: number; blocked: number };
    };

    expect(body.counts).toEqual({ clean: 1, blocked: 0 });
    expect(body.blocked).toEqual([]);
    expect(body.reports).toHaveLength(1);

    const report = body.reports[0]!;
    expect(report.id).toBe(reportId);
    expect(report.text).toContain("[REDACTED]");
    expect(report.text).not.toContain("₱1,200.00");
    expect(report.text).not.toContain("0917 123 4567");
    expect(report.fields).toEqual([
      "title",
      "actualBehavior",
      "expectedBehavior",
      "stepsToReproduce",
    ]);
    expect(report.redactedClasses).toContain("money");
    expect(report.redactedClasses).toContain("phone");
  });

  it("2. returns 401 when token is missing, malformed, or incorrect", async () => {
    const { env, database } = setupTestEnvironment();
    seedBugReport(database, {
      title: "Test report",
      actualBehavior: "Something went wrong",
      expectedBehavior: "Should work",
      stepsToReproduce: "Click button",
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    // Missing Authorization header
    const noAuth = await app.request("/api/ops/bug-reports", {}, env);
    expect(noAuth.status).toBe(401);
    await expect(noAuth.json()).resolves.toEqual({ error: "unauthorized" });
    expect(noAuth.headers.get("WWW-Authenticate")).toBe('Bearer realm="ops-egress"');

    // Empty Bearer header
    const emptyAuth = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: "" } },
      env,
    );
    expect(emptyAuth.status).toBe(401);
    await expect(emptyAuth.json()).resolves.toEqual({ error: "unauthorized" });

    // Non-Bearer scheme
    const basicAuth = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: "Basic dXNlcjpwYXNz" } },
      env,
    );
    expect(basicAuth.status).toBe(401);
    await expect(basicAuth.json()).resolves.toEqual({ error: "unauthorized" });

    // Wrong Bearer token
    const wrongToken = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: "Bearer wrong-token-value-xyz" } },
      env,
    );
    expect(wrongToken.status).toBe(401);
    await expect(wrongToken.json()).resolves.toEqual({ error: "unauthorized" });

    // Token of same length but mismatched character
    const tamperedToken = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN.slice(0, -1)}X` } },
      env,
    );
    expect(tamperedToken.status).toBe(401);
    await expect(tamperedToken.json()).resolves.toEqual({ error: "unauthorized" });

    // When OPS_EGRESS_TOKEN binding is missing from env altogether -> returns 401 without leaking
    const envNoSecret: Bindings = { DB: env.DB };
    const missingEnvSecret = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      envNoSecret,
    );
    expect(missingEnvSecret.status).toBe(401);
    await expect(missingEnvSecret.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("3. requires NO Supabase JWT — succeeds with no Supabase auth at all", async () => {
    const { env, database } = setupTestEnvironment();
    seedBugReport(database, {
      title: "Machine caller check",
      actualBehavior: "Automated egress test",
      expectedBehavior: "Success without user session",
      stepsToReproduce: "Direct API request",
    });

    // Provide an authVerifier that throws an explicit error if ever called
    const mockAuthVerifier = {
      verify: vi.fn().mockImplementation(() => {
        throw new Error("Supabase authVerifier must NEVER be invoked on ops routes");
      }),
    };

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
      authVerifier: mockAuthVerifier,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);
    // Verifies that createAuthMiddleware did not run on /api/ops/bug-reports
    expect(mockAuthVerifier.verify).not.toHaveBeenCalled();
  });

  it("4. a blocked report is NEVER emitted — assert id in blocked, nowhere in reports, and raw values absent from serialized body", async () => {
    const { env, database } = setupTestEnvironment();

    const canaryUnredactableToken = "CANARYTOKEN1234567890ABCDEF";
    const canaryBlockedRawTitle = "CANARY_BLOCKED_RAW_TITLE_9999";
    const canaryBlockedRawActual = `Error containing ${canaryUnredactableToken} in crash dump`;
    const canaryBlockedRawExpected = "CANARY_BLOCKED_RAW_EXPECTED_8888";
    const canaryBlockedRawSteps = "CANARY_BLOCKED_RAW_STEPS_7777";

    const { id: blockedId } = seedBugReport(database, {
      title: canaryBlockedRawTitle,
      actualBehavior: canaryBlockedRawActual,
      expectedBehavior: canaryBlockedRawExpected,
      stepsToReproduce: canaryBlockedRawSteps,
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);

    const rawResponseBody = await response.text();
    const parsedBody = JSON.parse(rawResponseBody) as {
      reports: Array<{ id: string }>;
      blocked: Array<{ id: string; detectorHits: string[] }>;
      counts: { clean: number; blocked: number };
    };

    // Assert blocked report ID appears under blocked
    expect(parsedBody.blocked.some((b) => b.id === blockedId)).toBe(true);

    // Assert blocked report ID appears NOWHERE in reports
    expect(parsedBody.reports.some((r) => r.id === blockedId)).toBe(false);

    // Assert by searching the serialized JSON response body that raw values appear nowhere
    expect(rawResponseBody).not.toContain(canaryUnredactableToken);
    expect(rawResponseBody).not.toContain(canaryBlockedRawTitle);
    expect(rawResponseBody).not.toContain(canaryBlockedRawActual);
    expect(rawResponseBody).not.toContain(canaryBlockedRawExpected);
    expect(rawResponseBody).not.toContain(canaryBlockedRawSteps);
  });

  it("5. no reporter email or raw content ever appears — search serialized JSON for absent fields", async () => {
    const { env, database } = setupTestEnvironment();

    const canaryReporterEmail = "canary_confidential_reporter_email_8899@enterprise.net";
    const canaryReporterUserId = "user-uuid-canary-secret-7766-5544-3322";
    const canaryRawTitle = "CANARY_RAW_TITLE_TEXT_112233";
    const canaryRawActual = "User user_canary@example.org reported CANARY_RAW_ACTUAL_445566";
    const canaryRawExpected = "CANARY_RAW_EXPECTED_TEXT_778899";
    const canaryRawSteps = "CANARY_RAW_STEPS_TEXT_001122";

    seedBugReport(database, {
      reporterUserId: canaryReporterUserId,
      reporterEmail: canaryReporterEmail,
      title: canaryRawTitle,
      actualBehavior: canaryRawActual,
      expectedBehavior: canaryRawExpected,
      stepsToReproduce: canaryRawSteps,
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);

    const serializedJson = await response.text();

    // Must search the serialized response directly:
    // Assert reporterEmail and reporterUserId field names never appear
    expect(serializedJson).not.toContain("reporterEmail");
    expect(serializedJson).not.toContain("reporterUserId");
    expect(serializedJson).not.toContain("reporter_email");
    expect(serializedJson).not.toContain("reporter_user_id");

    // Assert reporter sensitive identifiers never appear
    expect(serializedJson).not.toContain(canaryReporterEmail);
    expect(serializedJson).not.toContain(canaryReporterUserId);

    // Assert raw field values never appear
    expect(serializedJson).not.toContain(canaryRawActual);
    expect(serializedJson).not.toContain("user_canary@example.org");

    // Assert diagnostics / screenshot / OCR / internal DB fields never appear
    expect(serializedJson).not.toContain("diagnosticsJson");
    expect(serializedJson).not.toContain("diagnostics_json");
    expect(serializedJson).not.toContain("screenshot");
    expect(serializedJson).not.toContain("clientRequestId");
    expect(serializedJson).not.toContain("client_request_id");
  });

  it("6. audit rows are written for both a clean and a blocked report", async () => {
    const { env, database } = setupTestEnvironment();

    // 1 clean report
    const { id: cleanId } = seedBugReport(database, {
      title: "Clean report title",
      actualBehavior: "User payment to Juan Dela Cruz completed",
      expectedBehavior: "Show confirmation",
      stepsToReproduce: "Submit form",
    });

    // 1 blocked report (unredactable 16+ char token)
    const { id: blockedId } = seedBugReport(database, {
      title: "Blocked report title",
      actualBehavior: "Error CANARYTOKEN1234567890ABCDEF occurred",
      expectedBehavior: "No error",
      stepsToReproduce: "Open app",
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);

    // Verify audit rows in the database
    const cleanAuditRows = await bugReportEgressAuditRepository.listForReport(env, cleanId);
    expect(cleanAuditRows).toHaveLength(1);
    expect(cleanAuditRows[0]!.outcome).toBe("clean");
    expect(cleanAuditRows[0]!.fieldsSent).toBe(
      "title,actualBehavior,expectedBehavior,stepsToReproduce",
    );
    expect(cleanAuditRows[0]!.detectorHits).toBe("");

    const blockedAuditRows = await bugReportEgressAuditRepository.listForReport(env, blockedId);
    expect(blockedAuditRows).toHaveLength(1);
    expect(blockedAuditRows[0]!.outcome).toBe("blocked");
    expect(blockedAuditRows[0]!.fieldsSent).toBe("");
    expect(blockedAuditRows[0]!.detectorHits).toContain("card");

    // Verify summary counts
    const summary = await bugReportEgressAuditRepository.summarize(env);
    expect(summary).toEqual({ clean: 1, blocked: 1, total: 2 });
  });

  it("7. a redaction failure blocks rather than passes — throwing redaction reports blocked and is not emitted", async () => {
    const { env, database } = setupTestEnvironment();

    const canaryCrashActual = "CANARY_CRASH_ACTUAL_CONTENT_DO_NOT_EMIT";

    // 1 report that will trigger an exception during redaction
    const { id: failingId } = seedBugReport(database, {
      title: "TRIGGER_EXCEPTION_REPORT",
      actualBehavior: canaryCrashActual,
      expectedBehavior: "Expected behavior",
      stepsToReproduce: "Reproduce steps",
    });

    // 1 normal clean report to prove one bad report doesn't bring down the endpoint
    const { id: cleanId } = seedBugReport(database, {
      title: "Normal report",
      actualBehavior: "Normal actual behavior",
      expectedBehavior: "Normal expected",
      stepsToReproduce: "Normal steps",
    });

    // Custom redaction function that throws on TRIGGER_EXCEPTION_REPORT
    const customRedact = (fields: BugReportFields) => {
      if (fields.title === "TRIGGER_EXCEPTION_REPORT") {
        throw new Error("Simulated catastrophic redaction crash");
      }
      return redactBugReport(fields);
    };

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
      bugReportEgressRedact: customRedact,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    // Endpoint does NOT crash with 500 — returns 200
    expect(response.status).toBe(200);

    const rawResponse = await response.text();
    const body = JSON.parse(rawResponse) as {
      reports: Array<{ id: string }>;
      blocked: Array<{ id: string; detectorHits: string[] }>;
      counts: { clean: number; blocked: number };
    };

    // Assert failing report is reported as blocked
    expect(body.blocked.some((b) => b.id === failingId)).toBe(true);
    expect(body.reports.some((r) => r.id === failingId)).toBe(false);

    // Assert clean report is emitted
    expect(body.reports.some((r) => r.id === cleanId)).toBe(true);

    // Assert counts reflect 1 clean, 1 blocked
    expect(body.counts).toEqual({ clean: 1, blocked: 1 });

    // Search serialized JSON to prove raw content of failed report was NEVER emitted
    expect(rawResponse).not.toContain(canaryCrashActual);

    // Verify audit row was recorded for the blocked report
    const auditRows = await bugReportEgressAuditRepository.listForReport(env, failingId);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.outcome).toBe("blocked");
    expect(auditRows[0]!.fieldsSent).toBe("");
  });

  it("8. a malformed diagnostics_json does not fail the read — endpoint returns 200, well-formed report is processed, and malformed is not dropped", async () => {
    const { env, database } = setupTestEnvironment();

    // 1 well-formed report
    const { id: wellFormedId } = seedBugReport(database, {
      title: "Well-formed report title",
      actualBehavior: "User payment completed with ₱1,200.00 charge",
      expectedBehavior: "Confirmation receipt",
      stepsToReproduce: "Click submit",
    });

    // 1 report whose diagnostics_json is {"route":"/app/dashboard"} (missing required keys)
    const { id: malformedId } = seedBugReport(database, {
      title: "Malformed diagnostics report title",
      actualBehavior: "User sent to Juan Dela Cruz failed with ₱1,299.00 charge",
      expectedBehavior: "Expected success receipt and SMS to 0917 123 4567",
      stepsToReproduce: "Open transfer dialog and submit",
      diagnosticsJson: JSON.stringify({ route: "/app/dashboard" }),
    });

    const app = createApp({
      bugReports: bugReportRepository,
      bugReportEgressAudit: bugReportEgressAuditRepository,
    });

    const response = await app.request(
      "/api/ops/bug-reports",
      { headers: { Authorization: `Bearer ${OPS_TOKEN}` } },
      env,
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      reports: Array<{
        id: string;
        createdAt: string;
        text: string;
        fields: string[];
        redactedClasses: string[];
      }>;
      blocked: Array<{
        id: string;
        createdAt: string;
        detectorHits: string[];
      }>;
      counts: { clean: number; blocked: number };
    };

    // Assert well-formed report is still processed
    const wellFormedReport = body.reports.find((r) => r.id === wellFormedId);
    expect(wellFormedReport).toBeDefined();
    expect(wellFormedReport!.text).toContain("[REDACTED]");
    expect(wellFormedReport!.text).not.toContain("₱1,200.00");

    // Assert malformed report is NOT dropped — it is processed too and redacted
    const malformedReport = body.reports.find((r) => r.id === malformedId);
    expect(malformedReport).toBeDefined();
    expect(malformedReport!.text).toContain("[REDACTED]");
    expect(malformedReport!.text).not.toContain("₱1,299.00");
    expect(malformedReport!.text).not.toContain("0917 123 4567");
    expect(malformedReport!.text).not.toContain("Juan Dela Cruz");

    expect(body.counts.clean).toBe(2);
    expect(body.counts.blocked).toBe(0);
  });
});
