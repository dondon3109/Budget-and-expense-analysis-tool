import type { AssistantMessage, AssistantMessageInput, AssistantThread } from "@zoption/shared";
import {
  CURRENT_ASSISTANT_CONSENT_VERSION,
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  CURRENT_RECEIPT_CONSENT_VERSION,
} from "@zoption/shared";
import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { createAssistantService } from "../src/assistant/service";
import { createAssistantVoiceService } from "../src/assistant/voice-service";
import type { AssistantVoiceProviders } from "../src/assistant/voice-provider";
import type { AuthVerifier } from "../src/auth";
import type { AssistantRepository } from "../src/db/assistant";
import {
  billingRepository,
  consumeAiUsage,
  manilaMonth,
  manilaMonthStart,
  nextManilaMonth,
} from "../src/db/billing";
import type { ImportRepository } from "../src/db/imports";
import type { ReceiptRepository } from "../src/db/receipts";
import type { TenantResolver } from "../src/db/tenants";
import { createAiEntryService } from "../src/entry/ai-entry-service";
import type { RateLimiter } from "../src/rate-limit";
import { createReceiptService } from "../src/receipts/service";
import type { ReceiptVisionProvider } from "../src/receipts/vision-provider";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = "tenant-1";
const THREAD_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000002";
const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000004";
const AUTHORIZATION = { Authorization: "Bearer valid-token" };
const OPEN_MONTH = new Date("2026-07-30T12:00:00.000Z");

const databases: DatabaseSync[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
});

/** A migrated D1 database plus the one tenant the pool rows belong to. */
function environment(options: { pro?: boolean } = {}) {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
  if (options.pro) {
    database
      .prepare(
        `INSERT INTO billing_subscriptions (
           provider, provider_subscription_id, tenant_id, provider_customer_id, provider_plan_id,
           provider_status, status, interval, current_period_ends_at, cancel_at_period_end,
           last_provider_occurred_at, last_provider_event_id
         ) VALUES ('paypal', 'I-subscription', ?, 'payer', 'P-monthly', 'ACTIVE', 'active', 'month',
                   '2099-01-01T00:00:00.000Z', 0, '2026-08-01T00:00:00.000Z', 'event-1')`,
      )
      .run(TENANT_ID);
  }
  const env = { DB: binding, ASSISTANT_TIME_ZONE: "Asia/Manila" } satisfies Bindings;
  return { env, database };
}

function aiUsageRow(database: DatabaseSync, month = manilaMonth()) {
  return database
    .prepare(
      "SELECT count, allowance FROM billing_monthly_usage WHERE tenant_id = ? AND month = ? AND feature = 'ai_usage'",
    )
    .get(TENANT_ID, month) as { count: number; allowance: number } | undefined;
}

describe("shared monthly AI pool", () => {
  it("reports one ai_usage entry and the import allowance in the billing summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { env } = environment();

    const summary = await billingRepository.getSummary(env, TENANT_ID);

    expect(summary.usages).toEqual([
      {
        feature: "ai_usage",
        used: 0,
        limit: 500,
        periodKind: "calendar_month",
        periodStartedAt: manilaMonthStart(OPEN_MONTH),
        resetsAt: nextManilaMonth(OPEN_MONTH),
      },
      {
        feature: "file_import",
        used: 0,
        limit: 1,
        periodKind: "calendar_month",
        periodStartedAt: manilaMonthStart(OPEN_MONTH),
        resetsAt: nextManilaMonth(OPEN_MONTH),
      },
    ]);
  });

  it("increments one unit per billable request and keeps the Pro allowance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const free = environment();
    const pro = environment({ pro: true });

    await consumeAiUsage(free.env, TENANT_ID);
    await consumeAiUsage(free.env, TENANT_ID);
    await consumeAiUsage(pro.env, TENANT_ID);

    expect(aiUsageRow(free.database, "2026-07-01")).toEqual({ count: 2, allowance: 500 });
    expect(aiUsageRow(pro.database, "2026-07-01")).toEqual({ count: 1, allowance: 2000 });
  });

  it("buckets consumption by the Manila month, not the UTC month", async () => {
    const { env, database } = environment();
    // Manila has no DST: 15:59:59Z is still July there, 16:00:00Z is already August.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T15:59:59.999Z"));
    await consumeAiUsage(env, TENANT_ID);
    vi.setSystemTime(new Date("2026-07-31T16:00:00.000Z"));
    await consumeAiUsage(env, TENANT_ID);

    expect(aiUsageRow(database, "2026-07-01")).toEqual({ count: 1, allowance: 500 });
    expect(aiUsageRow(database, "2026-08-01")).toEqual({ count: 1, allowance: 500 });
  });

  it("refuses the request past the Free cap with the stable monthly limit error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { env, database } = environment();
    database
      .prepare(
        "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, ?, 'ai_usage', 500, 500)",
      )
      .run(TENANT_ID, manilaMonth(OPEN_MONTH));

    await expect(consumeAiUsage(env, TENANT_ID)).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      message: "You have reached your AI usage limit for this month.",
      details: {
        feature: "ai_usage",
        used: 500,
        limit: 500,
        periodKind: "calendar_month",
        periodStartedAt: manilaMonthStart(OPEN_MONTH),
        resetsAt: nextManilaMonth(OPEN_MONTH),
        billingPath: "/app/settings#plan-and-billing",
      },
    });
    expect(aiUsageRow(database)).toEqual({ count: 500, allowance: 500 });
  });

  it("refuses the request past the Pro cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { env, database } = environment({ pro: true });
    database
      .prepare(
        "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, ?, 'ai_usage', 2000, 2000)",
      )
      .run(TENANT_ID, manilaMonth(OPEN_MONTH));

    await expect(consumeAiUsage(env, TENANT_ID)).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      details: { feature: "ai_usage", used: 2000, limit: 2000 },
    });
  });

  it("reports the Free limit when a Pro tenant drops to Free above 500 used", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { env, database } = environment({ pro: true });
    await consumeAiUsage(env, TENANT_ID);
    database
      .prepare("UPDATE billing_monthly_usage SET count = 600 WHERE feature = 'ai_usage'")
      .run();
    database.prepare("DELETE FROM billing_subscriptions WHERE tenant_id = ?").run(TENANT_ID);

    await expect(consumeAiUsage(env, TENANT_ID)).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      details: { used: 600, limit: 500, periodKind: "calendar_month" },
    });
  });

  it("stays atomic at the cap under concurrent consumption", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { env, database } = environment();
    database
      .prepare(
        "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, ?, 'ai_usage', 499, 500)",
      )
      .run(TENANT_ID, manilaMonth(OPEN_MONTH));

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => consumeAiUsage(env, TENANT_ID)),
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes.filter(
        (outcome) =>
          outcome.status === "rejected" &&
          (outcome.reason as { code?: string }).code === "monthly_limit_reached",
      ),
    ).toHaveLength(4);
    expect(aiUsageRow(database)).toEqual({ count: 500, allowance: 500 });
  });

  it("propagates a database failure so the provider is never reached", async () => {
    const failure = new Error("D1_ERROR: network unavailable");
    const env = {
      DB: {
        prepare: () => {
          throw failure;
        },
      } as unknown as D1Database,
    } satisfies Bindings;

    await expect(consumeAiUsage(env, TENANT_ID)).rejects.toBe(failure);
  });

  it("keeps the monthly usage triggers that enforce the cap", async () => {
    const { database } = environment();
    const triggers = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'billing_monthly_usage_limit_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(triggers.map((row) => row.name)).toEqual([
      "billing_monthly_usage_limit_insert",
      "billing_monthly_usage_limit_update",
    ]);
  });
});

describe("0059 AI usage pool migration", () => {
  it("carries the current month into ai_usage and retires the per-feature rows", () => {
    // SQLite reads the real clock for date('now'), so this test stays on real timers.
    const month = manilaMonth();
    const { database } = createD1TestDatabase({
      afterMigration: ({ database: migrating, name }) => {
        if (name !== "0058_fx_rate_check.sql") return;
        migrating
          .prepare("INSERT INTO tenants (id, kind, name) VALUES ('free-tenant', 'user', 'Free')")
          .run();
        migrating
          .prepare("INSERT INTO tenants (id, kind, name) VALUES ('pro-tenant', 'user', 'Pro')")
          .run();
        migrating
          .prepare(
            `INSERT INTO billing_subscriptions (
               provider, provider_subscription_id, tenant_id, provider_customer_id, provider_plan_id,
               provider_status, status, interval, current_period_ends_at, cancel_at_period_end,
               last_provider_occurred_at, last_provider_event_id
             ) VALUES ('paypal', 'I-pro', 'pro-tenant', 'payer', 'P-monthly', 'ACTIVE', 'active',
                       'month', '2099-01-01T00:00:00.000Z', 0, '2026-08-01T00:00:00.000Z', 'event-1')`,
          )
          .run();
        const usage = migrating.prepare(
          "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, ?, ?, ?, ?)",
        );
        usage.run("free-tenant", month, "assistant_question", 7, 10);
        usage.run("free-tenant", "2020-01-01", "assistant_question", 9, 10);
        usage.run("pro-tenant", month, "assistant_question", 4, 100);
        usage.run("pro-tenant", month, "vision", 2, 60);
      },
    });
    databases.push(database);

    const rows = database
      .prepare(
        "SELECT tenant_id AS tenantId, month, feature, count, allowance FROM billing_monthly_usage ORDER BY tenant_id, month",
      )
      .all() as Array<{
      tenantId: string;
      month: string;
      feature: string;
      count: number;
      allowance: number;
    }>;

    expect(rows).toEqual([
      { tenantId: "free-tenant", month, feature: "ai_usage", count: 7, allowance: 500 },
      { tenantId: "pro-tenant", month, feature: "ai_usage", count: 4, allowance: 2000 },
    ]);
  });
});

/** Fakes for the pooled routes below; every provider is replaced so no network is reached. */
function authVerifier(): AuthVerifier {
  return {
    verify: vi.fn(async () => ({
      id: "user-1",
      email: "person@example.com",
      role: "authenticated",
    })),
  };
}

function tenantResolver(): TenantResolver {
  return {
    resolve: vi.fn(async () => ({
      tenantId: TENANT_ID,
      defaultAccountId: `${TENANT_ID}:account:default`,
    })),
  };
}

function rateLimiter(): RateLimiter {
  return {
    consume: vi.fn(async () => ({
      allowed: true,
      limit: 60,
      remaining: 59,
      retryAfterSeconds: 60,
    })),
  };
}

const THREAD: AssistantThread = {
  id: THREAD_ID,
  title: "How much did I spend?",
  kind: "text",
  lastMessageAt: "2026-08-10T00:00:01.000Z",
  createdAt: "2026-08-10T00:00:00.000Z",
};

const MESSAGE: AssistantMessage = {
  id: MESSAGE_ID,
  threadId: THREAD_ID,
  role: "assistant",
  content: "You spent PHP 2,455.",
  status: "completed",
  createdAt: "2026-08-10T00:00:01.000Z",
};

const INPUT: AssistantMessageInput = {
  message: "How much did I spend?",
  clientRequestId: CLIENT_REQUEST_ID,
};

function assistantRepository(): AssistantRepository {
  const start = {
    thread: THREAD,
    userMessage: { ...MESSAGE, id: "message-1", role: "user" as const, content: INPUT.message },
    history: [],
    runId: "run-1",
  };
  return {
    getPreferences: vi.fn(async () => ({
      consentedAt: "2026-07-27T00:00:00.000Z",
      consentVersion: CURRENT_ASSISTANT_CONSENT_VERSION,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
      responseDetail: "concise" as const,
      coachingStyle: "gentle" as const,
    })),
    createThread: vi.fn(async () => THREAD),
    beginTurn: vi.fn(async () => start),
    completeTurn: vi.fn(async () => ({
      thread: THREAD,
      userMessage: { ...start.userMessage, status: "completed" as const },
      assistantMessage: MESSAGE,
    })),
    failTurn: vi.fn(async () => undefined),
    listMemories: vi.fn(async () => []),
    getMemory: vi.fn(async () => null),
    upsertMemory: vi.fn(),
    countFacts: vi.fn(async () => 0),
    compactFacts: vi.fn(async () => 0),
  } as unknown as AssistantRepository;
}

function assistantOrchestrator() {
  const policy = {
    currentDate: "2026-08-02",
    timeZone: "Asia/Manila",
    compliance: { posture: "budgeting_allowed" as const, topics: [] },
    requiredToolGroups: ["period_summary" as const],
  };
  return {
    plan: vi.fn(async () => policy),
    answer: vi.fn(async () => ({
      content: MESSAGE.content,
      model: "deepseek-flash",
      finishReason: "stop",
      responseMetadata: { promptVersion: "expert-v1", compliance: policy.compliance, sources: [] },
      audit: {
        promptVersion: "expert-v1",
        compliancePolicyJson: JSON.stringify(policy),
        requiredToolGroupsJson: JSON.stringify(policy.requiredToolGroups),
        providerCallCount: 1,
        validationStatus: "passed" as const,
        toolCalls: [],
      },
    })),
  };
}

function voiceProviders(): AssistantVoiceProviders {
  return {
    transcription: {
      transcribe: vi.fn(async () => ({ text: "Check my budget", durationSeconds: 2 })),
    },
    speech: { synthesize: vi.fn(async () => new Response(new Uint8Array([1]))) },
  };
}

function voiceService(providers: AssistantVoiceProviders) {
  return createAssistantVoiceService(
    {
      getPreferences: vi.fn(async () => ({
        consentedAt: "2026-08-12T00:00:00.000Z",
        consentVersion: CURRENT_ASSISTANT_CONSENT_VERSION,
        retentionDays: 90,
        assistantName: "Aster",
        userPreferredName: "Don",
        responseDetail: "concise" as const,
        coachingStyle: "gentle" as const,
      })),
      getVoiceConsent: vi.fn(async () => ({
        consentedAt: "2026-08-12T00:00:00.000Z",
        consentVersion: CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
      })),
      grantVoiceConsent: vi.fn(),
      getCompletedAssistantMessage: vi.fn(async () => MESSAGE),
    } as never,
    providers,
  );
}

function receiptRepository(): ReceiptRepository {
  return {
    getConsent: vi.fn(async () => ({
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
    })),
    grantConsent: vi.fn(),
  } as unknown as ReceiptRepository;
}

function visionProvider(): ReceiptVisionProvider {
  return {
    extract: vi.fn(async () => ({
      merchant: "Jollibee",
      date: "08/13/2026",
      amountMinor: -28500,
      kind: "expense" as const,
      rawText: "JOLLIBEE 285.00",
    })),
  };
}

function importRepository(): ImportRepository {
  return {
    preview: vi.fn(async () => ({
      token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
      expiresAt: "2026-08-20T15:15:00.000Z",
      fileName: "statement.pdf",
      rowCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      duplicateCount: 0,
      rows: [],
    })),
    commit: vi.fn(),
  } as unknown as ImportRepository;
}

function appEnvironment() {
  const { binding, database } = createD1TestDatabase();
  databases.push(database);
  database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);

  const orchestrator = assistantOrchestrator();
  const voice = voiceProviders();
  const vision = visionProvider();
  const transcription = {
    transcribe: vi.fn(async () => ({ text: "Spent 250 pesos on lunch", durationSeconds: 2 })),
  };
  const ai = aiBinding();

  const app = createApp({
    readinessCheck: vi.fn(async () => undefined),
    authVerifier: authVerifier(),
    tenantResolver: tenantResolver(),
    rateLimiter: rateLimiter(),
    assistantService: createAssistantService(assistantRepository(), orchestrator),
    assistantVoiceService: voiceService(voice),
    receiptService: createReceiptService(receiptRepository(), vision),
    aiEntryService: createAiEntryService(receiptRepository(), importRepository(), transcription),
    assistantProvider: { complete: vi.fn() },
  });

  const env = {
    DB: binding,
    ASSISTANT_ENABLED: "true",
    ASSISTANT_VOICE_ENABLED: "true",
    ASSISTANT_TIME_ZONE: "Asia/Manila",
    RECEIPT_ENTRY_ENABLED: "true",
    FISH_AUDIO_API_KEY: "fish-test-credential",
    AI: ai as unknown as Ai,
  } satisfies Bindings;

  return { app, env, database, providers: { orchestrator, voice, vision, transcription, ai } };
}

function aiBinding() {
  return {
    run: vi.fn(
      async (
        _model: string,
        input: { response_format?: { json_schema?: { properties?: Record<string, unknown> } } },
      ) => {
        // The same binding serves both extractors; the requested schema says which one this is.
        const properties = input.response_format?.json_schema?.properties ?? {};
        return "draft" in properties
          ? {
              response: {
                draft: {
                  description: "Lunch",
                  amountPhp: "250.00",
                  kind: "expense",
                  categoryName: "Food",
                },
              },
            }
          : {
              response: {
                rows: [
                  {
                    date: "08/20/2026",
                    description: "Groceries",
                    amountMinor: -125_050,
                    kind: "expense",
                  },
                ],
              },
            };
      },
    ),
    toMarkdown: vi.fn(async () => ({
      id: "converted",
      name: "statement.pdf",
      mimeType: "application/pdf",
      format: "text" as const,
      tokens: 42,
      data: "08/20/2026 GROCERIES 1,250.50",
    })),
  };
}

function jsonInit(body: unknown) {
  return {
    method: "POST",
    headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function fileInit(field: string, file: File) {
  const form = new FormData();
  form.set(field, file);
  return { method: "POST", headers: AUTHORIZATION, body: form };
}

const POOLED_ROUTES = [
  {
    name: "assistant thread generation",
    path: "/api/app/assistant/threads",
    init: () => jsonInit(INPUT),
    status: 201,
  },
  {
    name: "assistant message generation",
    path: `/api/app/assistant/threads/${THREAD_ID}/messages`,
    init: () => jsonInit(INPUT),
    status: 200,
  },
  {
    name: "assistant voice transcription",
    path: "/api/app/assistant/voice/transcriptions",
    init: () =>
      fileInit("audio", new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" })),
    status: 200,
  },
  {
    name: "assistant speech synthesis",
    path: "/api/app/assistant/voice/speech",
    init: () => jsonInit({ messageId: MESSAGE_ID, voice: "bright" }),
    status: 200,
  },
  {
    name: "assistant speech preview",
    path: "/api/app/assistant/voice/preview",
    init: () => jsonInit({ voice: "energetic" }),
    status: 200,
  },
  {
    name: "receipt extraction",
    path: "/api/app/receipts/extract",
    init: () =>
      fileInit("image", new File([new Uint8Array([1])], "receipt.jpg", { type: "image/jpeg" })),
    status: 200,
  },
  {
    name: "PDF statement entry",
    path: "/api/app/entry/pdf-preview",
    init: () =>
      fileInit(
        "pdf",
        new File([new Uint8Array([1])], "statement.pdf", { type: "application/pdf" }),
      ),
    status: 200,
  },
  {
    name: "voice transaction entry",
    path: "/api/app/entry/voice",
    init: () =>
      fileInit("audio", new File([new Uint8Array([1])], "voice.m4a", { type: "audio/mp4" })),
    status: 200,
  },
] as const;

describe("pooled route consumption", () => {
  it.each(POOLED_ROUTES)("charges exactly one unit for $name", async ({ path, init, status }) => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { app, env, database } = appEnvironment();

    const response = await app.request(path, init(), env);

    expect(response.status).toBe(status);
    expect(aiUsageRow(database)).toEqual({ count: 1, allowance: 500 });
  });

  it("refuses every pooled route at the cap before any provider runs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_MONTH);
    const { app, env, database, providers } = appEnvironment();
    database
      .prepare(
        "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, ?, 'ai_usage', 500, 500)",
      )
      .run(TENANT_ID, manilaMonth(OPEN_MONTH));

    for (const route of POOLED_ROUTES) {
      const response = await app.request(route.path, route.init(), env);
      expect(response.status, route.name).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "monthly_limit_reached",
        message: "You have reached your AI usage limit for this month.",
        details: { feature: "ai_usage", used: 500, limit: 500 },
      });
    }
    expect(aiUsageRow(database)).toEqual({ count: 500, allowance: 500 });
    expect(providers.orchestrator.answer).not.toHaveBeenCalled();
    expect(providers.voice.transcription.transcribe).not.toHaveBeenCalled();
    expect(providers.voice.speech.synthesize).not.toHaveBeenCalled();
    expect(providers.vision.extract).not.toHaveBeenCalled();
    expect(providers.transcription.transcribe).not.toHaveBeenCalled();
    expect(providers.ai.run).not.toHaveBeenCalled();
    expect(providers.ai.toMarkdown).not.toHaveBeenCalled();
  });
});
