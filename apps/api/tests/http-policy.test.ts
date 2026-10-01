import type { MiddlewareHandler } from "hono";
import { describe, expect, it } from "vitest";

import { HttpError } from "../src/errors";
import {
  appBodyLimits,
  createBillingWebhookBodyLimit,
  jsonBodyLimitFor,
  multipartBodyRuleFor,
  supportBodyLimits,
} from "../src/http/body-limits";
import {
  SUPPORT_CHAT_RATE_LIMITS,
  appRateLimitFor,
  billingWebhookRateLimits,
  createAppRateLimit,
  createBillingWebhookRateLimit,
  createSupportRateLimit,
  type RateLimitIdentity,
} from "../src/http/rate-limit-policy";
import type { RateLimitPolicy, RateLimiter } from "../src/rate-limit";
import type { AppEnvironment, Bindings } from "../src/types";
import { createTestApp } from "./helpers/test-app";

const KIB = 1024;
const MIB = 1024 * KIB;
const MINUTE = 60;
const QUARTER_HOUR = 15 * 60;
const DAY = 24 * 60 * 60;

const tenantWrite = [{ scope: "tenant-write", limit: 60, windowSeconds: MINUTE }];
const tenantRead = [{ scope: "tenant-read", limit: 120, windowSeconds: MINUTE }];
const tenantImport = [{ scope: "tenant-import", limit: 20, windowSeconds: QUARTER_HOUR }];
const adminWrite = [{ scope: "platform-admin-seat-write", limit: 20, windowSeconds: QUARTER_HOUR }];
const adminRead = [{ scope: "platform-admin-seat-read", limit: 60, windowSeconds: MINUTE }];
const voiceSpeech = [
  { scope: "tenant-assistant-voice-speech-minute", limit: 12, windowSeconds: MINUTE },
];
const assistantGeneration = [
  { scope: "tenant-assistant-minute", limit: 10, windowSeconds: MINUTE },
];
const assistantRead = [{ scope: "tenant-assistant-read", limit: 60, windowSeconds: MINUTE }];
const exportRead = [{ scope: "tenant-export-read", limit: 20, windowSeconds: MINUTE }];

const APP_RATE_LIMITS: [string, string, RateLimitIdentity, RateLimitPolicy[]][] = [
  [
    "POST",
    "/api/app/assistant/voice/transcriptions",
    "tenant",
    [{ scope: "tenant-assistant-voice-transcription-minute", limit: 6, windowSeconds: MINUTE }],
  ],
  ["POST", "/api/app/assistant/voice/speech", "tenant", voiceSpeech],
  ["POST", "/api/app/assistant/voice/preview", "tenant", voiceSpeech],
  ["PATCH", "/api/app/assistant/voice/speech", "tenant", tenantWrite],
  ["GET", "/api/app/assistant/voice/stream", "tenant", tenantRead],
  [
    "POST",
    "/api/app/receipts/extract",
    "tenant",
    [{ scope: "tenant-receipt-extraction-minute", limit: 6, windowSeconds: MINUTE }],
  ],
  [
    "POST",
    "/api/app/entry/voice",
    "tenant",
    [{ scope: "tenant-entry-voice-minute", limit: 6, windowSeconds: MINUTE }],
  ],
  [
    "POST",
    "/api/app/entry/voice/entries",
    "tenant",
    [{ scope: "tenant-entry-voice-minute", limit: 6, windowSeconds: MINUTE }],
  ],
  ["GET", "/api/app/entry/voice", "tenant", tenantRead],
  [
    "POST",
    "/api/app/entry/pdf-preview",
    "tenant",
    [{ scope: "tenant-entry-pdf-minute", limit: 3, windowSeconds: MINUTE }],
  ],
  [
    "DELETE",
    "/api/app/account",
    "user",
    [{ scope: "user-account-deletion", limit: 5, windowSeconds: QUARTER_HOUR }],
  ],
  ["GET", "/api/app/account", "tenant", tenantRead],
  ["POST", "/api/app/admin/provider-configs", "user", adminWrite],
  ["PATCH", "/api/app/admin/reviews/review-1", "user", adminWrite],
  ["PUT", "/api/app/admin/provider-configs/config-1", "user", adminWrite],
  ["DELETE", "/api/app/admin/bug-reports/report-1", "user", adminWrite],
  ["GET", "/api/app/admin/seats", "user", adminRead],
  ["HEAD", "/api/app/admin/seats", "user", adminRead],
  ["OPTIONS", "/api/app/admin/seats", "user", adminRead],
  ["GET", "/api/app/admin", "tenant", tenantRead],
  [
    "POST",
    "/api/app/support/chat",
    "tenant",
    [
      { scope: "tenant-support-minute", limit: 10, windowSeconds: MINUTE },
      { scope: "tenant-support-day", limit: 100, windowSeconds: DAY },
    ],
  ],
  ["POST", "/api/app/support/bug-reports", "tenant", tenantWrite],
  ["POST", "/api/app/assistant/threads", "tenant", assistantGeneration],
  ["POST", "/api/app/assistant/threads/thread-1/messages", "tenant", assistantGeneration],
  ["POST", "/api/app/assistant/threads/thread-1/extra/messages", "tenant", tenantWrite],
  ["PATCH", "/api/app/assistant/threads/thread-1", "tenant", tenantWrite],
  ["DELETE", "/api/app/assistant/threads/thread-1", "tenant", tenantWrite],
  ["GET", "/api/app/assistant/threads", "tenant", assistantRead],
  ["GET", "/api/app/assistant/threads/thread-1/messages", "tenant", assistantRead],
  ["GET", "/api/app/exports/transactions.csv", "tenant", exportRead],
  ["GET", "/api/app/exports/account-archive.json", "tenant", exportRead],
  ["POST", "/api/app/exports/transactions.csv", "tenant", tenantWrite],
  ["POST", "/api/app/imports/preview", "tenant", tenantImport],
  ["POST", "/api/app/imports", "tenant", tenantImport],
  ["DELETE", "/api/app/imports/import-1", "tenant", tenantImport],
  ["GET", "/api/app/imports", "tenant", tenantRead],
  ["POST", "/api/app/transactions", "tenant", tenantWrite],
  ["PATCH", "/api/app/transactions/transaction-1", "tenant", tenantWrite],
  ["PUT", "/api/app/budgets/2026-09", "tenant", tenantWrite],
  ["DELETE", "/api/app/transactions/transaction-1", "tenant", tenantWrite],
  ["POST", "/api/app/sync/push", "tenant", tenantWrite],
  ["POST", "/api/app/profile/avatar", "tenant", tenantWrite],
  ["DELETE", "/api/app/profile/avatar", "tenant", tenantWrite],
  ["GET", "/api/app/transactions", "tenant", tenantRead],
  ["GET", "/api/app/dashboard", "tenant", tenantRead],
  ["HEAD", "/api/app/transactions", "tenant", []],
  ["OPTIONS", "/api/app/transactions", "tenant", []],
];

type BodyRule =
  | { kind: "multipart"; maxSize: number; typeMessage: string; sizeMessage: string }
  | { kind: "json"; maxSize: number }
  | { kind: "none" };

const MULTIPART = "multipart/form-data; boundary=zoption";
const voiceUpload: BodyRule = {
  kind: "multipart",
  maxSize: 4 * MIB + 64 * KIB,
  typeMessage: "Send voice recordings as multipart form data.",
  sizeMessage: "The voice recording is too large.",
};
const voiceEntryUpload: BodyRule = {
  kind: "multipart",
  maxSize: 4 * MIB + 64 * KIB,
  typeMessage: "Send voice recordings as multipart form data or JSON transcript.",
  sizeMessage: "The voice recording is too large.",
};
const receiptUpload: BodyRule = {
  kind: "multipart",
  maxSize: 8 * MIB + 64 * KIB,
  typeMessage: "Send the receipt photo as multipart form data.",
  sizeMessage: "The receipt photo is too large.",
};
const statementUpload: BodyRule = {
  kind: "multipart",
  maxSize: 5 * MIB + 64 * KIB,
  typeMessage: "Send the statement PDF as multipart form data.",
  sizeMessage: "The statement PDF is too large.",
};
const avatarUpload: BodyRule = {
  kind: "multipart",
  maxSize: 2 * MIB + 64 * KIB,
  typeMessage: "Send the profile picture as multipart form data.",
  sizeMessage: "The profile picture is too large.",
};
const defaultJson: BodyRule = { kind: "json", maxSize: 64 * KIB };
const noBody: BodyRule = { kind: "none" };

const APP_BODY_RULES: [string, string, string | undefined, BodyRule][] = [
  ["POST", "/api/app/assistant/voice/transcriptions", MULTIPART, voiceUpload],
  ["POST", "/api/app/assistant/voice/transcriptions", "application/json", voiceUpload],
  ["POST", "/api/app/receipts/extract", MULTIPART, receiptUpload],
  ["POST", "/api/app/receipts/extract", undefined, receiptUpload],
  ["POST", "/api/app/entry/voice", MULTIPART, voiceEntryUpload],
  ["POST", "/api/app/entry/voice", undefined, voiceEntryUpload],
  ["POST", "/api/app/entry/voice", "text/plain", voiceEntryUpload],
  ["POST", "/api/app/entry/voice", "application/json", defaultJson],
  ["POST", "/api/app/entry/voice", "Application/JSON; charset=utf-8", defaultJson],
  ["POST", "/api/app/entry/voice", "application/vnd.zoption+json", defaultJson],
  ["GET", "/api/app/entry/voice", undefined, noBody],
  ["POST", "/api/app/entry/pdf-preview", MULTIPART, statementUpload],
  ["POST", "/api/app/profile/avatar", MULTIPART, avatarUpload],
  ["PATCH", "/api/app/profile/avatar", "application/json", defaultJson],
  ["DELETE", "/api/app/profile/avatar", "application/json", defaultJson],
  ["POST", "/api/app/imports/preview", "application/json", { kind: "json", maxSize: 3 * MIB }],
  ["PATCH", "/api/app/imports/preview", "application/json", defaultJson],
  ["POST", "/api/app/imports", "application/json", defaultJson],
  ["POST", "/api/app/transactions", "application/json", defaultJson],
  ["PATCH", "/api/app/transactions/transaction-1", "application/json", defaultJson],
  ["PUT", "/api/app/budgets/2026-09", "application/json", defaultJson],
  ["POST", "/api/app/sync/push", "application/json", defaultJson],
  ["DELETE", "/api/app/account", "application/json", defaultJson],
  ["DELETE", "/api/app/transactions/transaction-1", undefined, noBody],
  ["GET", "/api/app/transactions", undefined, noBody],
  ["HEAD", "/api/app/transactions", undefined, noBody],
  ["OPTIONS", "/api/app/transactions", undefined, noBody],
];

function bodyRuleFor(method: string, path: string, contentType: string | undefined): BodyRule {
  const multipart = multipartBodyRuleFor(method, path, contentType);
  if (multipart) return { kind: "multipart", ...multipart };
  const maxSize = jsonBodyLimitFor(method, path);
  return maxSize === undefined ? { kind: "none" } : { kind: "json", maxSize };
}

interface Consumed {
  identity: string;
  policy: RateLimitPolicy;
}

function capturingRateLimiter(consumed: Consumed[]): RateLimiter {
  return {
    async consume(_env, identity, policy) {
      consumed.push({ identity, policy });
      return {
        allowed: true,
        limit: policy.limit,
        remaining: policy.limit - 1,
        retryAfterSeconds: 0,
      };
    },
  };
}

function appWith(middleware: MiddlewareHandler<AppEnvironment>) {
  const app = createTestApp({
    user: { id: "user-1" },
    tenant: { tenantId: "tenant-1", defaultAccountId: "account-1", onboardingComplete: true },
  });
  app.use("*", middleware);
  app.all("*", (context) => context.text("ok"));
  app.onError((error, context) =>
    error instanceof HttpError
      ? context.json({ error: error.code, message: error.message }, error.status)
      : context.json({ error: "internal_server_error" }, 500),
  );
  return app;
}

function send(
  app: ReturnType<typeof appWith>,
  method: string,
  path: string,
  init: { contentType?: string; size?: number; clientIp?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.contentType) headers["Content-Type"] = init.contentType;
  if (init.clientIp) headers["CF-Connecting-IP"] = init.clientIp;
  const body = init.size === undefined ? undefined : "x".repeat(init.size);
  return app.request(path, { method, headers, body }, {} as Bindings);
}

describe("app rate limit policy", () => {
  it.each(APP_RATE_LIMITS)("%s %s draws on the %s budget", (method, path, identity, policies) => {
    expect(appRateLimitFor(method, path)).toEqual({ identity, policies });
  });

  it("keys user routes by the signed-in user and the rest by tenant", async () => {
    const consumed: Consumed[] = [];
    const app = appWith(createAppRateLimit(capturingRateLimiter(consumed)));

    await send(app, "DELETE", "/api/app/account");
    await send(app, "GET", "/api/app/admin/seats");
    await send(app, "GET", "/api/app/transactions");
    await send(app, "OPTIONS", "/api/app/transactions");

    expect(consumed.map(({ identity, policy }) => [identity, policy.scope])).toEqual([
      ["user-1", "user-account-deletion"],
      ["user-1", "platform-admin-seat-read"],
      ["tenant-1", "tenant-read"],
    ]);
  });
});

describe("public rate limit policy", () => {
  it("caps public support chat per minute and per day", () => {
    expect(SUPPORT_CHAT_RATE_LIMITS).toEqual([
      { scope: "public-support-minute", limit: 8, windowSeconds: MINUTE },
      { scope: "public-support-day", limit: 40, windowSeconds: DAY },
    ]);
  });

  it("caps each billing webhook provider separately", () => {
    expect(billingWebhookRateLimits("paypal")).toEqual([
      { scope: "paypal-webhook", limit: 60, windowSeconds: MINUTE },
    ]);
    expect(billingWebhookRateLimits("dodo")).toEqual([
      { scope: "dodo-webhook", limit: 60, windowSeconds: MINUTE },
    ]);
  });

  it("keys public support posts by client IP", async () => {
    const consumed: Consumed[] = [];
    const app = appWith(createSupportRateLimit(capturingRateLimiter(consumed)));

    await send(app, "GET", "/api/support/chat");
    await send(app, "POST", "/api/support/chat", { clientIp: " 203.0.113.9 " });
    await send(app, "POST", "/api/support/chat");

    expect(consumed.map(({ identity, policy }) => [identity, policy.scope])).toEqual([
      ["203.0.113.9", "public-support-minute"],
      ["203.0.113.9", "public-support-day"],
      ["missing-cf-connecting-ip", "public-support-minute"],
      ["missing-cf-connecting-ip", "public-support-day"],
    ]);
  });

  it("keys billing webhook posts by client IP", async () => {
    const consumed: Consumed[] = [];
    const app = appWith(createBillingWebhookRateLimit(capturingRateLimiter(consumed), "dodo"));

    await send(app, "GET", "/api/billing/dodo/webhook");
    await send(app, "POST", "/api/billing/dodo/webhook", { clientIp: "198.51.100.4" });
    await send(app, "POST", "/api/billing/dodo/webhook");

    expect(consumed.map(({ identity, policy }) => [identity, policy.scope])).toEqual([
      ["198.51.100.4", "dodo-webhook"],
      ["missing-cf-connecting-ip", "dodo-webhook"],
    ]);
  });
});

describe("app body limits", () => {
  it.each(APP_BODY_RULES)("%s %s (%s)", (method, path, contentType, rule) => {
    expect(bodyRuleFor(method, path, contentType)).toEqual(rule);
  });

  it("rejects an upload that is not multipart with the route's message", async () => {
    const response = await send(appWith(appBodyLimits), "POST", "/api/app/profile/avatar", {
      contentType: "image/png",
      size: 10,
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_media_type",
      message: "Send the profile picture as multipart form data.",
    });
  });

  it("rejects an upload over its cap with the route's message", async () => {
    const app = appWith(appBodyLimits);
    const cap = 2 * MIB + 64 * KIB;

    const atCap = await send(app, "POST", "/api/app/profile/avatar", {
      contentType: MULTIPART,
      size: cap,
    });
    const overCap = await send(app, "POST", "/api/app/profile/avatar", {
      contentType: MULTIPART,
      size: cap + 1,
    });

    expect(atCap.status).toBe(200);
    expect(overCap.status).toBe(413);
    await expect(overCap.json()).resolves.toEqual({
      error: "payload_too_large",
      message: "The profile picture is too large.",
    });
  });

  it("requires JSON for writes and caps it at the default", async () => {
    const app = appWith(appBodyLimits);

    const plain = await send(app, "POST", "/api/app/transactions", {
      contentType: "text/plain",
      size: 10,
    });
    const atCap = await send(app, "POST", "/api/app/transactions", {
      contentType: "application/json",
      size: 64 * KIB,
    });
    const overCap = await send(app, "POST", "/api/app/transactions", {
      contentType: "application/json",
      size: 64 * KIB + 1,
    });
    const read = await send(app, "GET", "/api/app/transactions");

    expect(plain.status).toBe(415);
    await expect(plain.json()).resolves.toEqual({
      error: "unsupported_media_type",
      message: "Send the request body as application/json.",
    });
    expect(atCap.status).toBe(200);
    expect(overCap.status).toBe(413);
    await expect(overCap.json()).resolves.toEqual({
      error: "payload_too_large",
      message: "The request body is too large.",
    });
    expect(read.status).toBe(200);
  });
});

describe("public body limits", () => {
  it("accepts only small JSON support posts and never caches support responses", async () => {
    const app = appWith(supportBodyLimits);

    const read = await send(app, "GET", "/api/support/chat");
    const plain = await send(app, "POST", "/api/support/chat", {
      contentType: "text/plain",
      size: 10,
    });
    const atCap = await send(app, "POST", "/api/support/chat", {
      contentType: "application/json",
      size: 24 * KIB,
    });
    const overCap = await send(app, "POST", "/api/support/chat", {
      contentType: "application/json",
      size: 24 * KIB + 1,
    });

    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    expect(plain.status).toBe(415);
    expect(plain.headers.get("Cache-Control")).toBe("no-store");
    expect(atCap.status).toBe(200);
    expect(overCap.status).toBe(413);
  });

  it("caps billing webhook bodies", async () => {
    const app = appWith(createBillingWebhookBodyLimit());

    const atCap = await send(app, "POST", "/api/billing/paypal/webhook", { size: 128 * KIB });
    const overCap = await send(app, "POST", "/api/billing/paypal/webhook", {
      size: 128 * KIB + 1,
    });

    expect(atCap.status).toBe(200);
    expect(overCap.status).toBe(413);
    await expect(overCap.json()).resolves.toEqual({
      error: "payload_too_large",
      message: "The request body is too large.",
    });
  });
});
