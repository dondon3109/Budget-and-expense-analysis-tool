import { describe, expect, it, vi } from "vitest";

import type { AssistantProvider } from "../src/assistant/provider";
import { createApp } from "../src/app";
import type { RateLimiter, RateLimitPolicy } from "../src/rate-limit";
import { completeSupportChat } from "../src/support/service";
import type { Bindings } from "../src/types";

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
