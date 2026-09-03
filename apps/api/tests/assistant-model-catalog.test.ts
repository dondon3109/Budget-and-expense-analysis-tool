// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

import { listAssistantModels } from "../src/assistant/model-catalog";
import { AssistantProviderError } from "../src/assistant/provider-error";
import { createProviderCredentialRoutes } from "../src/routes/provider-credentials";
import { createAdminProviderConfigRoutes } from "../src/routes/admin-provider-configs";
import { providerRegistry } from "../src/provider-registry";
import { HttpError } from "../src/errors";
import { encryptSecret } from "../src/provider-credentials/crypto";
import type { Bindings } from "../src/types";

const TEST_MASTER_KEY = btoa("\x01".repeat(32));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function openAiListResponse(ids: string[]): Response {
  return jsonResponse({ data: ids.map((id) => ({ id })) });
}

describe("listAssistantModels", () => {
  it("lists OpenAI models with Bearer auth against /v1/models", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(openAiListResponse(["gpt-4o", "gpt-4o-mini"]));
    const models = await listAssistantModels(undefined, "openai", "sk-test", fetcher);
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url).split("?")[0]).toBe("https://api.openai.com/v1/models");
    expect(String(url)).toContain("limit=100");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
  });

  it("derives the DeepSeek models URL from its chat endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(openAiListResponse(["deepseek-chat"]));
    await listAssistantModels(undefined, "deepseek", "sk-test", fetcher);
    expect(String(fetcher.mock.calls[0][0]).split("?")[0]).toBe("https://api.deepseek.com/models");
  });

  it("lists Muse Spark models from Meta's Model API, not the Llama API", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(openAiListResponse(["muse-spark-1.1"]));
    const models = await listAssistantModels(undefined, "muse_spark", "meta-key", fetcher);
    expect(models).toEqual(["muse-spark-1.1"]);
    expect(String(fetcher.mock.calls[0][0]).split("?")[0]).toBe("https://api.meta.ai/v1/models");
  });

  it("lists Anthropic models with its native auth headers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(openAiListResponse(["claude-3-5-haiku-latest"]));
    const models = await listAssistantModels(undefined, "anthropic", "sk-ant-test", fetcher);
    expect(models).toEqual(["claude-3-5-haiku-latest"]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url).split("?")[0]).toBe("https://api.anthropic.com/v1/models");
    expect(init.headers).toMatchObject({
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
    });
  });

  it("lists Gemini models that support content generation without the models/ prefix", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        models: [
          {
            name: "models/gemini-2.0-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    );
    const models = await listAssistantModels(undefined, "gemini", "AIza-test", fetcher);
    expect(models).toEqual(["gemini-2.0-flash"]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url).split("?")[0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
    expect(init.headers).toMatchObject({ "x-goog-api-key": "AIza-test" });
  });

  it("follows has_more across pages until a short final page", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "b-model" }], has_more: true, last_id: "b-model" }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "a-model" }], has_more: false }));
    const models = await listAssistantModels(undefined, "openai", "sk-test", fetcher);
    expect(models).toEqual(["a-model", "b-model"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("after=b-model");
  });

  it("paginates Anthropic with after_id", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "m1" }], has_more: true, last_id: "m1" }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "m2" }], has_more: false }));
    const models = await listAssistantModels(undefined, "anthropic", "sk-ant", fetcher);
    expect(models).toEqual(["m1", "m2"]);
    expect(String(fetcher.mock.calls[1][0])).toContain("after_id=m1");
  });

  it("follows Gemini page tokens", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          models: [{ name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] }],
          nextPageToken: "tok-1",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          models: [{ name: "models/gemini-b", supportedGenerationMethods: ["generateContent"] }],
        }),
      );
    const models = await listAssistantModels(undefined, "gemini", "AIza-test", fetcher);
    expect(models).toEqual(["gemini-a", "gemini-b"]);
    expect(String(fetcher.mock.calls[1][0])).toContain("pageToken=tok-1");
  });

  it("dedupes, sorts, and caps the returned ids", async () => {
    const ids = ["b-model", "a-model", "b-model", "  "];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(openAiListResponse(ids));
    await expect(listAssistantModels(undefined, "meta", "meta-key", fetcher)).resolves.toEqual([
      "a-model",
      "b-model",
    ]);
  });

  it("rejects a missing key without calling the vendor", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(listAssistantModels(undefined, "openai", "  ", fetcher)).rejects.toMatchObject({
      kind: "configuration",
      reason: "missing_api_key",
      provider: "openai",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "configuration", "credentials_rejected"],
    [429, "rate_limit", "rate_limited"],
    [500, "unavailable", "upstream_unavailable"],
    [400, "invalid_response", "request_rejected"],
  ])("maps HTTP %i to %s/%s", async (status, kind, reason) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive", { status }));
    await expect(listAssistantModels(undefined, "openai", "k", fetcher)).rejects.toMatchObject({
      kind,
      reason,
      provider: "openai",
    });
  });

  it("maps network failures and unusable payloads without leaking the key", async () => {
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error("sk-secret-boom"));
    const error = await listAssistantModels(undefined, "openai", "sk-secret-boom", failing).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(AssistantProviderError);
    expect(JSON.stringify(error)).not.toContain("sk-secret-boom");

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ nope: true }));
    await expect(listAssistantModels(undefined, "openai", "k", malformed)).rejects.toMatchObject({
      reason: "malformed_response",
    });

    const empty = vi.fn<typeof fetch>().mockResolvedValue(openAiListResponse([]));
    await expect(listAssistantModels(undefined, "openai", "k", empty)).rejects.toMatchObject({
      reason: "malformed_response",
    });
  });

  it("rejects providers without model listing", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(listAssistantModels(undefined, "google", "k", fetcher)).rejects.toMatchObject({
      reason: "request_rejected",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function modelsApp(credentialRepo: any) {
  const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
  const routes = createProviderCredentialRoutes(platformAdmins as any, credentialRepo, {
    invalidate: vi.fn(),
  } as any);
  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("authUser", { id: "admin" });
    c.env = { PROVIDER_CREDENTIAL_ENCRYPTION_KEY: TEST_MASTER_KEY, DB: {} as any };
    await next();
  });
  app.route("/", routes);
  app.onError((err, c) => {
    if (err instanceof HttpError)
      return c.json({ error: err.code, message: err.message }, err.status);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}

describe("provider-credential model routes", () => {
  it("previews live models for an unsaved key without echoing the secret", async () => {
    const app = modelsApp({} as any);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => openAiListResponse(["gpt-4o-mini"])) as typeof fetch;
    try {
      const res = await app.request("/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", secret: "sk-preview-9999" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "openai", models: ["gpt-4o-mini"] });
      expect(JSON.stringify(body)).not.toContain("sk-preview-9999");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("rejects listing for non-assistant providers", async () => {
    const app = modelsApp({} as any);
    const res = await app.request("/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "fish_audio", secret: "long-enough-secret" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("unknown_provider");
  });

  it("maps a rejected key to credential_invalid", async () => {
    const app = modelsApp({} as any);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    try {
      const res = await app.request("/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", secret: "sk-bad-key-1234" }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toBe("credential_invalid");
      expect(JSON.stringify(body)).not.toContain("sk-bad-key-1234");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("lists models for a saved credential after decrypting it", async () => {
    const secret = "sk-saved-ABCD";
    const enc = await encryptSecret(secret, TEST_MASTER_KEY);
    const repo = {
      getEncryptedById: vi.fn(async () => ({
        id: "cred-1",
        provider: "deepseek",
        encrypted_secret: enc,
        api_key_last4: "ABCD",
      })),
    };
    const app = modelsApp(repo);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => openAiListResponse(["deepseek-v4-flash"])) as typeof fetch;
    try {
      const res = await app.request("/cred-1/models", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ provider: "deepseek", models: ["deepseek-v4-flash"] });
      expect(JSON.stringify(body)).not.toContain(secret);
      expect(JSON.stringify(body)).not.toContain(enc);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("returns 404 for an unknown credential id", async () => {
    const app = modelsApp({ getEncryptedById: vi.fn(async () => null) });
    const res = await app.request("/missing/models", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("assistant configs accept live-fetched models", () => {
  function configApp() {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const credId = "66666666-6666-4666-8666-666666666666";
    const credRepo = {
      getById: vi.fn(async (_env: any, id: string) =>
        id === credId
          ? { id: credId, provider: "openai", name: "OpenAI Test", apiKeyLast4: "1234" }
          : null,
      ),
    };
    const configRepo = {
      create: vi.fn(async (_env: any, input: any, actorId: string) => ({
        id: "cfg-1",
        ...input,
        enabled: true,
        priority: 1,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      })),
      list: vi.fn(async () => []),
      getById: vi.fn(),
      getActive: vi.fn(),
      update: vi.fn(),
      setActive: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(async () => []),
    };
    const routes = createAdminProviderConfigRoutes(
      platformAdmins as any,
      configRepo as any,
      providerRegistry as any,
      credRepo as any,
    );
    const app = new Hono();
    app.use("*", async (c: any, next: any) => {
      c.set("authUser", { id: "admin-1" });
      c.env = { DB: {} as any };
      await next();
    });
    app.onError((err, c) => {
      if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    app.route("/configs", routes);
    return { app, credId };
  }

  it("creates an assistant config with a model outside the curated list", async () => {
    const { app, credId } = configApp();
    const res = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "assistant",
        provider: "openai",
        model: "gpt-4o-next-unlisted",
        displayName: "OpenAI next",
        credentialId: credId,
      }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).model).toBe("gpt-4o-next-unlisted");
  });

  it("still rejects unknown assistant providers", async () => {
    const { app } = configApp();
    const res = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "assistant", provider: "unknown_vendor", model: "x" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("invalid_provider_model");
  });

  it("keeps strict model validation for voice services", async () => {
    const { app } = configApp();
    const res = await app.request("/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "stt",
        provider: "google",
        model: "not-a-real-model",
        displayName: "Google nope",
      }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("invalid_provider_model");
  });
});
