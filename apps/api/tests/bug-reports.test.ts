import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { bugReportResponseSchema, type BugReportCreateInput } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bugReportRepository } from "../src/db/bug-reports";
import { createBugReportService } from "../src/support/bug-reports";
import type { Bindings, EmailSender } from "../src/types";

const TENANT_ID = "user:user-1";
const USER = { id: "user-1", email: "Person@Example.com", role: "authenticated" };
const databases: DatabaseSync[] = [];

function d1For(database: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let bindings: SQLInputValue[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bindings = values as SQLInputValue[];
          return statement;
        },
        async first<T>() {
          return (database.prepare(sql).get(...bindings) as T | undefined) ?? null;
        },
        async all<T>() {
          return {
            success: true,
            meta: {},
            results: database.prepare(sql).all(...bindings) as T[],
          };
        },
        async run() {
          const result = database.prepare(sql).run(...bindings);
          return { success: true, meta: { changes: Number(result.changes) }, results: [] };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function environment(): { env: Bindings; database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  database.exec("PRAGMA foreign_keys = ON; CREATE TABLE tenants (id text PRIMARY KEY NOT NULL);");
  database.prepare("INSERT INTO tenants (id) VALUES (?)").run(TENANT_ID);
  // The egress read excludes reports that already crossed, so it needs the audit table too.
  for (const migrationFile of ["0030_bug_reports.sql", "0061_bug_report_egress_audit.sql"]) {
    const migration = readFileSync(
      new URL(`../../../db/migrations/${migrationFile}`, import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");
    database.exec(migration);
  }
  return {
    env: {
      DB: d1For(database),
      WEB_APP_URL: "https://zoption.site",
      EMAIL_FROM: "hello@zoption.site",
      BUG_REPORT_TO: "support@zoption.site",
    },
    database,
  };
}

function input(overrides: Partial<BugReportCreateInput> = {}): BugReportCreateInput {
  return {
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    title: "Calendar does not open an event",
    category: "ui",
    actualBehavior: "Selecting an event leaves the details panel empty.",
    expectedBehavior: "The selected event details should appear in the panel.",
    stepsToReproduce: "Open Calendar, select a day with an event, then select the event.",
    frequency: "always",
    pageContext: "calendar",
    diagnostics: {
      route: "/app/calendar",
      releaseVersion: "2.0.0",
      viewportWidth: 390,
      viewportHeight: 844,
      displayMode: "standalone",
      platform: "android",
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("bug report persistence and delivery", () => {
  it("keeps the admin read strict while the egress read tolerates malformed diagnostics", async () => {
    const { env, database } = environment();
    const send = vi.fn<EmailSender["send"]>().mockResolvedValue(undefined);
    const email: EmailSender = { send };
    const service = createBugReportService(bugReportRepository, email);
    const created = await service.create(env, TENANT_ID, USER, input());

    database
      .prepare("UPDATE bug_reports SET diagnostics_json = ? WHERE id = ?")
      .run(JSON.stringify({ route: "/app/calendar" }), created.id);

    // The admin read must surface a malformed row instead of handing the UI a null it types as present.
    await expect(bugReportRepository.listAll(env, 10)).rejects.toThrow();

    // The egress read never loads diagnostics, so the same row cannot starve it.
    await expect(bugReportRepository.listForEgress(env, 10)).resolves.toHaveLength(1);
  });

  it("stores before email delivery and treats the client request ID as idempotent", async () => {
    const { env, database } = environment();
    const send = vi.fn<EmailSender["send"]>().mockResolvedValue(undefined);
    const email: EmailSender = { send };
    const service = createBugReportService(bugReportRepository, email);

    const first = await service.create(env, TENANT_ID, USER, input());
    const retried = await service.create(
      env,
      TENANT_ID,
      USER,
      input({ title: "A retry must not replace the original report" }),
    );

    expect(retried).toEqual(first);
    expect(first.reference).toMatch(/^BR-\d{8}-[A-F0-9]{12}$/);
    expect(send).toHaveBeenCalledOnce();
    const sent = send.mock.calls[0]?.[0];
    expect(sent?.to).toBe("support@zoption.site");
    expect(sent?.from).toEqual({ email: "hello@zoption.site", name: "Zoption" });
    expect(sent?.subject).toContain(first.reference);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count, notification_status AS status FROM bug_reports GROUP BY notification_status",
        )
        .get(),
    ).toEqual({ count: 1, status: "sent" });
  });

  it("keeps the report when email fails and retries it later", async () => {
    const { env, database } = environment();
    const email = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary outage"))
        .mockResolvedValueOnce(undefined),
    };
    const service = createBugReportService(bugReportRepository, email);

    const report = await service.create(env, TENANT_ID, USER, input());
    expect(report.status).toBe("new");
    expect(database.prepare("SELECT notification_status AS status FROM bug_reports").get()).toEqual(
      { status: "failed" },
    );

    await expect(service.retryPendingNotifications(env, 10)).resolves.toEqual({
      claimed: 1,
      sent: 1,
      failed: 0,
    });
    expect(
      database
        .prepare(
          "SELECT notification_status AS status, notification_attempts AS attempts FROM bug_reports",
        )
        .get(),
    ).toEqual({ status: "sent", attempts: 2 });
  });

  it("isolates reporter reads by tenant and exposes operational fields only to admins", async () => {
    const { env, database } = environment();
    database.prepare("INSERT INTO tenants (id) VALUES (?)").run("user:user-2");
    const service = createBugReportService(bugReportRepository, {
      send: vi.fn().mockResolvedValue(undefined),
    });
    await service.create(env, TENANT_ID, USER, input());

    await expect(service.listForReporter(env, "user:user-2")).resolves.toEqual([]);
    const reporterReports = await service.listForReporter(env, TENANT_ID);
    expect(reporterReports).toHaveLength(1);
    expect(reporterReports[0]).not.toHaveProperty("reporterEmail");
    // The mobile client decodes this response strictly, timestamps included.
    expect(() => bugReportResponseSchema.parse(reporterReports[0])).not.toThrow();
    const adminReports = await service.listForAdmin(env);
    expect(adminReports[0]).toMatchObject({
      reporterUserId: "user-1",
      reporterEmail: "person@example.com",
      notificationStatus: "sent",
    });
  });
});
