import { afterEach, describe, expect, it } from "vitest";

import { createTrialEmailService } from "../src/billing/trial-emails";
import { billingRepository, hasProEntitlement } from "../src/db/billing";
import { tenantBootstrapRepository } from "../src/db/tenants";
import type { Bindings, EmailSender } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const databases: Array<{ close(): void }> = [];
const DAY_MS = 24 * 60 * 60 * 1_000;

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function environment() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  const env: Bindings = {
    DB: binding,
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    RESEND_API_KEY: "resend-key",
    EMAIL_FROM: "hello@zoption.site",
    WEB_APP_URL: "https://zoption.site",
  } as Bindings;
  return { env, database };
}

function recipientFetcher(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ email: "owner@example.com" }), {
      status: 200,
    })) as unknown as typeof fetch;
}

function recordingService(options: { fail?: boolean } = {}) {
  const sent: Parameters<EmailSender["send"]>[0][] = [];
  const service = createTrialEmailService({
    sender: {
      async send(message) {
        if (options.fail) throw new Error("boom");
        sent.push(message);
      },
    },
    fetcher: recipientFetcher(),
  });
  return { sent, service };
}

function trialEndsAt(database: ReturnType<typeof environment>["database"]): Date {
  const row = database.prepare("SELECT ends_at AS endsAt FROM pro_trials").get();
  return new Date(String(row?.endsAt));
}

describe("7-day Pro trial", () => {
  it("gives a new workspace Pro for seven days without a subscription", async () => {
    const { env, database } = environment();
    const { tenantId } = await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });

    const endsAt = trialEndsAt(database);
    expect(endsAt.getTime() - Date.now()).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(endsAt.getTime() - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
    expect(await hasProEntitlement(env, tenantId)).toBe(true);

    const summary = await billingRepository.getSummary(env, tenantId);
    expect(summary).toMatchObject({
      plan: "zoption_pro",
      entitlementSource: null,
      provider: null,
      status: "trialing",
      currentPeriodEndsAt: endsAt.toISOString(),
      canCheckout: true,
    });
  });

  it("returns the workspace to Free once the trial ends and never grants a second one", async () => {
    const { env, database } = environment();
    const { tenantId } = await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    database.exec(
      "UPDATE pro_trials SET ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')",
    );

    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    expect(await hasProEntitlement(env, tenantId)).toBe(false);
    expect((await billingRepository.getSummary(env, tenantId)).plan).toBe("free");
  });

  it("backfills a trial for existing workspaces that do not already have Pro", () => {
    const { database } = createD1TestDatabase({
      beforeMigration({ database: migrating, name }) {
        if (name !== "0065_pro_trials.sql") return;
        migrating.exec(`
          INSERT INTO tenants (id, kind, name) VALUES ('user:free', 'user', 'Free');
          INSERT INTO tenants (id, kind, name) VALUES ('user:admin', 'user', 'Admin');
          INSERT INTO user_tenants (user_id, tenant_id) VALUES ('admin', 'user:admin');
          INSERT INTO platform_admin_grants (user_id, complimentary_pro_enabled) VALUES ('admin', 1);
        `);
      },
    });
    databases.push(database);

    const rows = database.prepare("SELECT tenant_id AS tenantId FROM pro_trials").all();
    expect(rows.map((row) => row.tenantId)).toEqual(["user:free"]);
  });

  it("emails the trial start once, the day before it ends, and when it has ended", async () => {
    const { env, database } = environment();
    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    const endsAt = trialEndsAt(database);
    const { sent, service } = recordingService();

    await service.sendDue(env, 50, new Date());
    await service.sendDue(env, 50, new Date());
    await service.sendDue(env, 50, new Date(endsAt.getTime() - 2 * DAY_MS));
    await service.sendDue(env, 50, new Date(endsAt.getTime() - 12 * 60 * 60 * 1_000));
    await service.sendDue(env, 50, new Date(endsAt.getTime() - 60_000));
    // The view compares with SQLite's clock, so end the trial there too.
    database.exec(
      "UPDATE pro_trials SET ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')",
    );
    await service.sendDue(env, 50, new Date(Date.now() + 1_000));
    await service.sendDue(env, 50, new Date(Date.now() + 2_000));

    expect(sent.map((message) => message.subject)).toEqual([
      "Your 7-day Zoption Pro trial has started",
      "Your Zoption Pro trial ends tomorrow",
      "Your Zoption Pro trial has ended",
    ]);
    expect(sent.every((message) => message.to === "owner@example.com")).toBe(true);
    expect(sent[0]?.text).toContain("No card or payment setup is needed");
    expect(sent[2]?.html).toContain('href="https://zoption.site/app/settings"');
  });

  it("sends only the ended email when earlier stages were missed", async () => {
    const { env } = environment();
    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    const { sent, service } = recordingService();

    await service.sendDue(env, 50, new Date(Date.now() + 8 * DAY_MS));
    await service.sendDue(env, 50, new Date(Date.now() + 9 * DAY_MS));

    expect(sent.map((message) => message.subject)).toEqual(["Your Zoption Pro trial has ended"]);
  });

  it("skips trial emails for a workspace that already has Pro another way", async () => {
    const { env, database } = environment();
    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    database.exec(
      "INSERT INTO platform_admin_grants (user_id, complimentary_pro_enabled) VALUES ('user-1', 1)",
    );
    const { sent, service } = recordingService();

    const result = await service.sendDue(env, 50, new Date(Date.now() + 8 * DAY_MS));

    expect(result).toMatchObject({ skipped: 1, sent: 0 });
    expect(sent).toEqual([]);
    expect(database.prepare("SELECT ended_email_at FROM pro_trials").get()).toEqual({
      ended_email_at: expect.any(String),
    });
  });

  it("retries a failed stage, gives it up after twelve failures, and still sends later stages", async () => {
    const { env, database } = environment();
    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    const failing = recordingService({ fail: true });

    for (let attempt = 0; attempt < 11; attempt += 1) await failing.service.sendDue(env, 50);
    expect(
      database.prepare("SELECT started_email_at, email_failures FROM pro_trials").get(),
    ).toEqual({ started_email_at: null, email_failures: 11 });

    await failing.service.sendDue(env, 50);
    expect(
      database.prepare("SELECT started_email_at, email_failures FROM pro_trials").get(),
    ).toEqual({ started_email_at: expect.any(String), email_failures: 0 });
    expect(await failing.service.sendDue(env, 50)).toMatchObject({ checked: 0 });

    const { sent, service } = recordingService();
    await service.sendDue(env, 50, new Date(trialEndsAt(database).getTime() - 60_000));
    expect(sent.map((message) => message.subject)).toEqual([
      "Your Zoption Pro trial ends tomorrow",
    ]);
  });

  it("does not spend attempts while email delivery is not configured", async () => {
    const { env, database } = environment();
    await tenantBootstrapRepository.bootstrap(env, { id: "user-1" });
    const { sent, service } = recordingService();

    const result = await service.sendDue({ ...env, EMAIL_FROM: undefined }, 50);

    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
    expect(sent).toEqual([]);
    expect(
      database.prepare("SELECT started_email_at, email_failures FROM pro_trials").get(),
    ).toEqual({ started_email_at: null, email_failures: 0 });
  });

  it("never lets already-handled rows fill the sweep limit", async () => {
    const { env, database } = environment();
    for (let index = 0; index < 5; index += 1) {
      await tenantBootstrapRepository.bootstrap(env, { id: `user-${index}` });
    }
    const endsAt = trialEndsAt(database);
    const lastDay = new Date(endsAt.getTime() - 60_000);
    const { sent, service } = recordingService();

    // Each run sends at most two, and rows already sent their ending email are not reselected.
    for (let run = 0; run < 3; run += 1) await service.sendDue(env, 2, lastDay);

    expect(sent.map((message) => message.subject)).toEqual(
      Array.from({ length: 5 }, () => "Your Zoption Pro trial ends tomorrow"),
    );
  });
});
