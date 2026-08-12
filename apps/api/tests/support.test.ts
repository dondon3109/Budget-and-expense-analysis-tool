import { describe, expect, it, vi } from "vitest";

import type { AssistantProvider } from "../src/assistant/provider";
import { createApp } from "../src/app";
import type { RateLimiter, RateLimitPolicy } from "../src/rate-limit";
import { completeSupportChat } from "../src/support/service";
import type { Bindings } from "../src/types";
import type { BugReportService } from "../src/support/bug-reports";
import type { PlatformAdminService } from "../src/platform-admin";

const env = {
  DB: {} as D1Database,
  ASSISTANT_ENABLED: "true",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
} satisfies Bindings;

function supportProvider(answer = "Open Import, choose your file, then review the preview.") {
  const complete = vi.fn<AssistantProvider["complete"]>().mockResolvedValue({
    model: "deepseek-v4-flash",
    finishReason: "stop",
    message: { role: "assistant", content: answer },
  });
  return {
    complete,
  } satisfies AssistantProvider;
}

function allowedRateLimiter(): RateLimiter {
  const consume = vi
    .fn<RateLimiter["consume"]>()
    .mockImplementation(
      async (requestEnv: Bindings, clientIdentifier: string, policy: RateLimitPolicy) => {
        void requestEnv;
        void clientIdentifier;
        return {
          allowed: true,
          limit: policy.limit,
          remaining: policy.limit - 1,
          retryAfterSeconds: policy.windowSeconds,
        };
      },
    );
  return {
    consume,
  };
}

function bugReportServiceMock(): BugReportService {
  return {
    create: vi.fn(),
    listForReporter: vi.fn(),
    getForReporter: vi.fn(),
    listForAdmin: vi.fn(),
    updateStatus: vi.fn(),
    retryPendingNotifications: vi.fn(),
    cleanupExpired: vi.fn(),
  };
}

describe("product support chat", () => {
  it("uses the DeepSeek provider with bounded product knowledge and no tools", async () => {
    const provider = supportProvider();

    await expect(
      completeSupportChat(env, provider, {
        pageContext: "import",
        messages: [{ role: "user", content: "How do I import my spreadsheet?" }],
      }),
    ).resolves.toEqual({
      message: "Open Import, choose your file, then review the preview.",
    });

    expect(provider.complete).toHaveBeenCalledOnce();
    const request = vi.mocked(provider.complete).mock.calls[0]?.[1];
    expect(request?.tools).toEqual([]);
    expect(request?.toolChoice).toBe("none");
    expect(request?.messages[0]).toMatchObject({ role: "system" });
    expect(request?.messages[0]?.content).toContain("You have no access to the person's account");
    expect(request?.messages[0]?.content).toContain("Current surface: import");
    expect(request?.messages[0]?.content).toContain("CSV, XLSX, and XLS");
    expect(request?.messages[0]?.content).toContain("safe clickable links");
    expect(request?.messages[0]?.content).toContain("support@zoption.site");
    expect(request?.messages[1]).toEqual({
      role: "user",
      content: "How do I import my spreadsheet?",
    });
  });

  it("turns a signed-in support conversation into a review-only bug-report draft", async () => {
    const provider = supportProvider();
    vi.mocked(provider.complete).mockResolvedValueOnce({
      model: "deepseek-v4-flash",
      finishReason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "draft-1",
            type: "function",
            function: {
              name: "draft_bug_report",
              arguments: JSON.stringify({
                title: "Calendar event details stay empty",
                category: "ui",
                actualBehavior: "The event details panel stays empty after selecting an event.",
                expectedBehavior: "The selected event details should appear.",
                stepsToReproduce: "Open Calendar, select a populated day, then select an event.",
                frequency: "always",
              }),
            },
          },
        ],
      },
    });

    const result = await completeSupportChat(
      env,
      provider,
      {
        pageContext: "calendar",
        messages: [{ role: "user", content: "Calendar event details stay blank." }],
      },
      { bugReportDrafting: true },
    );
    expect(result.message).toContain("Review every field");
    expect(result.bugReportDraft).toMatchObject({
      title: "Calendar event details stay empty",
      frequency: "always",
    });

    const request = vi.mocked(provider.complete).mock.calls[0]?.[1];
    expect(request?.toolChoice).toBe("auto");
    expect(request?.tools[0]?.function.name).toBe("draft_bug_report");
  });

  it("serves the public endpoint without authentication and rate-limits by Cloudflare client IP", async () => {
    const provider = supportProvider();
    const rateLimiter = allowedRateLimiter();
    const app = createApp({ supportProvider: provider, rateLimiter });

    const response = await app.request(
      "/api/support/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.9",
        },
        body: JSON.stringify({
          pageContext: "landing",
          messages: [{ role: "user", content: "What is Zoption?" }],
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Open Import, choose your file, then review the preview.",
    });
    expect(rateLimiter.consume).toHaveBeenNthCalledWith(1, env, "203.0.113.9", {
      scope: "public-support-minute",
      limit: 8,
      windowSeconds: 60,
    });
    expect(rateLimiter.consume).toHaveBeenNthCalledWith(2, env, "203.0.113.9", {
      scope: "public-support-day",
      limit: 40,
      windowSeconds: 86_400,
    });
  });

  it("requires authentication and explicit validated input before creating a tenant report", async () => {
    const reports = bugReportServiceMock();
    const report = {
      id: "00000000-0000-4000-8000-000000000099",
      reference: "BR-20260812-001122334455",
      title: "Calendar event details stay empty",
      category: "ui" as const,
      actualBehavior: "The event details panel stays empty.",
      expectedBehavior: "The selected event details should appear.",
      stepsToReproduce: "Open Calendar, select a day, then select an event.",
      frequency: "always" as const,
      pageContext: "calendar" as const,
      diagnostics: {
        route: "/app/calendar",
        releaseVersion: "2.0.0",
        viewportWidth: 390,
        viewportHeight: 844,
        displayMode: "standalone" as const,
        platform: "android" as const,
      },
      status: "new" as const,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    vi.mocked(reports.create).mockResolvedValue(report);
    const app = createApp({
      supportProvider: supportProvider(),
      bugReportService: reports,
      rateLimiter: allowedRateLimiter(),
      authVerifier: {
        verify: vi.fn().mockResolvedValue({ id: "user-1", email: "person@example.com" }),
      },
      tenantResolver: {
        resolve: vi.fn().mockResolvedValue({ tenantId: "user:user-1", defaultAccountId: "cash" }),
      },
    });
    const body = {
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      title: report.title,
      category: report.category,
      actualBehavior: report.actualBehavior,
      expectedBehavior: report.expectedBehavior,
      stepsToReproduce: report.stepsToReproduce,
      frequency: report.frequency,
      pageContext: report.pageContext,
      diagnostics: report.diagnostics,
    };

    const unauthorized = await app.request(
      "/api/app/support/bug-reports",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      env,
    );
    expect(unauthorized.status).toBe(401);

    const response = await app.request(
      "/api/app/support/bug-reports",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer valid-token" },
        body: JSON.stringify(body),
      },
      env,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(report);
    expect(reports.create).toHaveBeenCalledWith(
      env,
      "user:user-1",
      { id: "user-1", email: "person@example.com" },
      body,
    );
  });

  it("protects the cross-tenant report inbox with platform-admin authorization", async () => {
    const reports = bugReportServiceMock();
    vi.mocked(reports.listForAdmin).mockResolvedValue([]);
    const requireAdmin = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      bugReportService: reports,
      rateLimiter: allowedRateLimiter(),
      authVerifier: { verify: vi.fn().mockResolvedValue({ id: "admin-1" }) },
      platformAdminService: { requireAdmin } as unknown as PlatformAdminService,
    });

    const response = await app.request(
      "/api/app/admin/bug-reports",
      { headers: { Authorization: "Bearer valid-token" } },
      env,
    );

    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledWith(env, "admin-1");
    expect(reports.listForAdmin).toHaveBeenCalledWith(env);
  });

  it("rejects malformed, non-JSON, and disabled support requests before provider use", async () => {
    const provider = supportProvider();
    const app = createApp({ supportProvider: provider, rateLimiter: allowedRateLimiter() });

    const nonJson = await app.request("/api/support/chat", { method: "POST", body: "hello" }, env);
    expect(nonJson.status).toBe(415);

    const malformed = await app.request(
      "/api/support/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageContext: "landing",
          messages: [{ role: "assistant", content: "Not a user turn" }],
        }),
      },
      env,
    );
    expect(malformed.status).toBe(400);

    const disabled = await app.request(
      "/api/support/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageContext: "landing",
          messages: [{ role: "user", content: "Hello" }],
        }),
      },
      { ...env, ASSISTANT_ENABLED: "false" },
    );
    expect(disabled.status).toBe(404);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});
