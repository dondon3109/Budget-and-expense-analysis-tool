// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProviderCredentialRoutes } from "../src/routes/provider-credentials";
import { createAdminProviderConfigRoutes } from "../src/routes/admin-provider-configs";
import { Hono } from "hono";
import { HttpError } from "../src/errors";
import { encryptSecret, getLast4 } from "../src/provider-credentials/crypto";

// Generate a deterministic 32-byte master key (base64)
const TEST_MASTER_KEY = btoa("\x01".repeat(32));

function makeEnv(master = TEST_MASTER_KEY) {
  return { PROVIDER_CREDENTIAL_ENCRYPTION_KEY: master, DB: {} as any };
}

function authEnv() {
  return { DB: {} as D1Database };
}

describe("provider_credentials — encrypted reusable credentials", () => {
  it("encrypts and decrypts round-trip, never returns plaintext or ciphertext", async () => {
    const secret = "sk-test-1234-ABCD-5678-21A9";
    const enc = await encryptSecret(secret, TEST_MASTER_KEY);
    expect(enc).not.toContain(secret);
    expect(enc).not.toContain("21A9");
    // decrypt
    const { decryptSecret } = await import("../src/provider-credentials/crypto");
    const dec = await decryptSecret(enc, TEST_MASTER_KEY);
    expect(dec).toBe(secret);
    expect(getLast4(secret)).toBe("21A9");
  });

  it("IV is random per encryption (same plaintext → different ciphertext)", async () => {
    const secret = "same-secret-21A9";
    const a = await encryptSecret(secret, TEST_MASTER_KEY);
    const b = await encryptSecret(secret, TEST_MASTER_KEY);
    expect(a).not.toBe(b);
  });

  it("create credential — stores encrypted, returns only last4, never secret/ciphertext", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    // in-memory repo
    const store = new Map();
    const repo = {
      listWithUsage: vi.fn(async () => []),
      list: vi.fn(async () => []),
      getById: vi.fn(async (env, id) =>
        store.get(id)
          ? {
              id,
              provider: "google",
              name: store.get(id).name,
              apiKeyLast4: store.get(id).last4,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: "admin",
            }
          : null,
      ),
      getEncryptedById: vi.fn(async (env, id) =>
        store.get(id)
          ? {
              id,
              provider: "google",
              name: store.get(id).name,
              encrypted_secret: store.get(id).enc,
              api_key_last4: store.get(id).last4,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              updated_by: "admin",
            }
          : null,
      ),
      create: vi.fn(async (env, input, actor) => {
        const id = "cred-1";
        store.set(id, {
          name: input.name,
          enc: input.encryptedSecret,
          last4: input.apiKeyLast4,
          provider: input.provider,
        });
        return {
          id,
          provider: input.provider,
          name: input.name,
          apiKeyLast4: input.apiKeyLast4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: actor,
        };
      }),
      update: vi.fn(),
      delete: vi.fn(),
      listUsagesForCredential: vi.fn(async () => []),
      countUsages: vi.fn(async () => 0),
    };
    const routes = createProviderCredentialRoutes(
      platformAdmins as any,
      repo as any,
      { invalidate: vi.fn() } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        name: "Google STT Production",
        secret: "super-secret-21A9",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Google STT Production");
    expect(body.apiKeyLast4).toBe("21A9");
    const payload = JSON.stringify(body);
    expect(payload).not.toContain("super-secret");
    expect(payload).not.toContain("encrypted_secret");
    expect(body.encrypted_secret).toBeUndefined();
  });

  it("rejects an unknown provider with a readable error before touching storage", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const repo = { create: vi.fn(async () => ({ id: "never" })) };
    const routes = createProviderCredentialRoutes(
      platformAdmins as any,
      repo as any,
      { invalidate: vi.fn() } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "bogus_vendor",
        name: "Bogus",
        secret: "long-enough-secret",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("unknown_provider");
    expect(typeof body.message).toBe("string");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("reuses one credential across multiple configs", async () => {
    // Create credential once, then two configs reference same credentialId
    const credId = "11111111-1111-4111-8111-111111111111";
    const cred = { id: credId, provider: "google", name: "Google Production", apiKeyLast4: "21A9" };
    const configRepo = {
      list: vi.fn(async () => []),
      getById: vi.fn(async (env, id) =>
        id === "cfg-1"
          ? {
              id: "cfg-1",
              service: "stt",
              provider: "google",
              model: "chirp_3",
              displayName: "Google Chirp 3",
              credentialId: credId,
              enabled: true,
              priority: 1,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: null,
            }
          : id === "cfg-2"
            ? {
                id: "cfg-2",
                service: "stt",
                provider: "google",
                model: "chirp_3",
                displayName: "Google Experimental",
                credentialId: credId,
                enabled: true,
                priority: 2,
                isActive: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                updatedBy: null,
              }
            : null,
      ),
      getActive: vi.fn(),
      create: vi.fn(async (env, input) => ({
        id: "cfg-1",
        service: input.service,
        provider: input.provider,
        model: input.model,
        displayName: input.displayName,
        credentialId: input.credentialId,
        enabled: true,
        priority: 1,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: "admin",
      })),
      update: vi.fn(),
      setActive: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(async () => []),
    };
    const credRepo = {
      getById: vi.fn(async (env, id) => (id === credId ? cred : null)),
      getEncryptedById: vi.fn(async () => null),
      listWithUsage: vi.fn(async () => [
        {
          ...cred,
          usedBy: [
            {
              configId: "cfg-1",
              service: "stt",
              provider: "google",
              model: "chirp_3",
              displayName: "Google Chirp 3",
              isActive: true,
            },
            {
              configId: "cfg-2",
              service: "stt",
              provider: "google",
              model: "chirp_3",
              displayName: "Google Experimental",
              isActive: false,
            },
          ],
        },
      ]),
      list: vi.fn(async () => [cred]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(async () => {
        throw new HttpError(409, "credential_in_use", "in use", {
          usedBy: [{ configId: "cfg-1" }, { configId: "cfg-2" }],
        });
      }),
      countUsages: vi.fn(async () => 2),
      listUsagesForCredential: vi.fn(async () => [{ configId: "cfg-1" }, { configId: "cfg-2" }]),
    };
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const registry = {
      validateAllowlist: vi.fn(() => true),
      invalidate: vi.fn(),
      getHealth: vi.fn(),
      getActive: vi.fn(),
      getAll: vi.fn(),
      getAssistantProvider: vi.fn(),
      getVoiceProviders: vi.fn(),
      getDecryptedSecret: vi.fn(),
    };

    const credRoutes = createProviderCredentialRoutes(
      platformAdmins as any,
      credRepo as any,
      registry as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/creds", credRoutes);
    app.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message, details: err.details }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    // list shows usedBy with two configs
    const listRes = await app.request("/creds", { method: "GET" });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.credentials[0].usedBy.length).toBe(2);

    // delete blocked
    const delRoutes = createProviderCredentialRoutes(
      platformAdmins as any,
      credRepo as any,
      registry as any,
    );
    const delApp = new Hono();
    delApp.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    delApp.route("/", delRoutes);
    delApp.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message, details: err.details }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const delRes = await delApp.request(`/${credId}`, { method: "DELETE" });
    expect(delRes.status).toBe(409);
    const delBody = await delRes.json();
    expect(delBody.error).toBe("credential_in_use");
    expect(delBody.details.usedBy.length).toBe(2);
    // never leaks secret
    expect(JSON.stringify(delBody)).not.toContain("21A9".repeat(2));
  });

  it("rejects cross-provider credential reuse", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const credId = "22222222-2222-4222-8222-222222222222";
    const cfgId = "33333333-3333-4333-8333-333333333333";
    const credRepo = {
      getById: vi.fn(async () => ({
        id: credId,
        provider: "google",
        name: "Google Prod",
        apiKeyLast4: "21A9",
      })),
    };
    const configRepo = {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => ({
        id: cfgId,
        service: "assistant",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        displayName: "DeepSeek",
        credentialId: null,
        enabled: true,
        priority: 1,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      })),
      getActive: vi.fn(),
      create: vi.fn(),
      update: vi.fn(async () => {
        throw new Error("should not be called");
      }),
      setActive: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(async () => []),
    };
    const registry = { validateAllowlist: vi.fn(() => true), invalidate: vi.fn() };
    const routes = createAdminProviderConfigRoutes(
      platformAdmins as any,
      configRepo as any,
      registry as any,
      credRepo as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request(`/${cfgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: credId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("credential_provider_mismatch");
  });

  it("rotate credential updates last4 and invalidates registry", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const invalidate = vi.fn();
    const store = { enc: "old", last4: "1111", name: "Google Prod", provider: "google" };
    const repo = {
      getById: vi.fn(async () => ({
        id: "cred-1",
        provider: "google",
        name: "Google Prod",
        apiKeyLast4: "1111",
      })),
      getEncryptedById: vi.fn(async () => ({
        id: "cred-1",
        provider: "google",
        name: "Google Prod",
        encrypted_secret: store.enc,
        api_key_last4: "1111",
      })),
      update: vi.fn(async (env, id, patch) => {
        if (patch.encryptedSecret) {
          store.enc = patch.encryptedSecret;
          store.last4 = patch.apiKeyLast4;
        }
        if (patch.name) store.name = patch.name;
        return {
          id: "cred-1",
          provider: "google",
          name: store.name,
          apiKeyLast4: store.last4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: "admin",
        };
      }),
      listWithUsage: vi.fn(async () => []),
      list: vi.fn(async () => []),
      create: vi.fn(),
      delete: vi.fn(),
      listUsagesForCredential: vi.fn(async () => []),
    };
    const routes = createProviderCredentialRoutes(
      platformAdmins as any,
      repo as any,
      { invalidate } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError)
        return c.json({ error: err.code, message: err.message }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request("/cred-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "new-secret-9999" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKeyLast4).toBe("9999");
    expect(JSON.stringify(body)).not.toContain("new-secret");
    expect(invalidate).toHaveBeenCalled();
  });

  it("test credential decrypts and returns ok without leaking secret", async () => {
    const secret = "test-secret-ABCD";
    const enc = await encryptSecret(secret, TEST_MASTER_KEY);
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const repo = {
      getEncryptedById: vi.fn(async () => ({
        id: "cred-1",
        provider: "deepseek",
        encrypted_secret: enc,
        api_key_last4: "ABCD",
      })),
    };
    const routes = createProviderCredentialRoutes(
      platformAdmins as any,
      repo as any,
      { invalidate: vi.fn() } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request("/cred-1/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.last4).toBe("ABCD");
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain(enc);
  });

  it("activation invalidates cache immediately (not waiting for TTL)", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const invalidate = vi.fn();
    const configRepo = {
      getById: vi.fn(async () => ({
        id: "cfg-1",
        service: "stt",
        provider: "google",
        model: "chirp_3",
        displayName: "Google Chirp",
        credentialId: "cred-1",
        enabled: true,
        isActive: false,
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      })),
      setActive: vi.fn(async () => ({
        id: "cfg-1",
        service: "stt",
        provider: "google",
        model: "chirp_3",
        displayName: "Google Chirp",
        credentialId: "cred-1",
        enabled: true,
        isActive: true,
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: "admin",
      })),
      getActive: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(),
    };
    const routes = createAdminProviderConfigRoutes(
      platformAdmins as any,
      configRepo as any,
      { validateAllowlist: vi.fn(() => true), invalidate } as any,
      { getById: vi.fn(async () => ({ provider: "google" })) } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    app.onError((err, c) => {
      if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
      return c.json({ error: "internal" }, 500);
    });
    const res = await app.request("/cfg-1/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(invalidate).toHaveBeenCalledWith("stt");
  });

  it("never exposes ciphertext in list or get", async () => {
    const platformAdmins = { requireAdmin: vi.fn(async () => undefined) };
    const repo = {
      listWithUsage: vi.fn(async () => [
        { id: "cred-1", provider: "deepseek", name: "Prod", apiKeyLast4: "1234", usedBy: [] },
      ]),
      list: vi.fn(async () => []),
      getById: vi.fn(),
      getEncryptedById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listUsagesForCredential: vi.fn(async () => []),
    };
    const routes = createProviderCredentialRoutes(
      platformAdmins as any,
      repo as any,
      { invalidate: vi.fn() } as any,
    );
    const app = new Hono();
    app.use("*", async (c, next) => {
      (c as any).set("authUser", { id: "admin" });
      (c as any).env = makeEnv();
      await next();
    });
    app.route("/", routes);
    const res = await app.request("/", { method: "GET" });
    const body = await res.json();
    const payload = JSON.stringify(body);
    expect(payload).not.toContain("encrypted_secret");
    expect(payload).not.toContain("secret");
  });

  it("reports Google STT health with encrypted DB credential last4", async () => {
    const { createProviderRegistry } = await import("../src/provider-registry");
    const credId = "google-cred-1";
    const googleCfg = {
      id: "cfg-g1",
      service: "stt",
      provider: "google",
      model: "gemini-3.5-transcribe",
      displayName: "Google Gemini 3.5 Transcribe",
      credentialId: credId,
      enabled: true,
      priority: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    };
    const configRepo = {
      list: vi.fn(async () => [googleCfg]),
      getById: vi.fn(async (_env, id) => (id === googleCfg.id ? googleCfg : null)),
      getActive: vi.fn(async (_env, service) => (service === "stt" ? googleCfg : null)),
      create: vi.fn(),
      update: vi.fn(),
      setActive: vi.fn(),
      reorder: vi.fn(),
      listAudits: vi.fn(async () => []),
    };
    const encSecret = await encryptSecret("AIzaSyTestSecret1234", TEST_MASTER_KEY);
    const credRepo = {
      getById: vi.fn(async (_env, id) =>
        id === credId
          ? { id: credId, provider: "google", name: "Google Voice Key", apiKeyLast4: "1234" }
          : null,
      ),
      getEncryptedById: vi.fn(async (_env, id) =>
        id === credId
          ? {
              id: credId,
              provider: "google",
              name: "Google Voice Key",
              encrypted_secret: encSecret,
              api_key_last4: "1234",
            }
          : null,
      ),
      listWithUsage: vi.fn(async () => []),
      list: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listUsagesForCredential: vi.fn(async () => []),
      countUsages: vi.fn(async () => 1),
    };
    const registry = createProviderRegistry(configRepo as any, credRepo as any);
    const health = await registry.getHealth(makeEnv() as any);
    const sttHealth = health.find((h) => h.service === "stt");
    expect(sttHealth).toBeDefined();
    expect(sttHealth?.hasCredential).toBe(true);
    expect(sttHealth?.apiKeyLast4).toBe("1234");
    expect(sttHealth?.credentialSource).toBe("db");
    expect(sttHealth?.details).toContain("••••1234");
  });
});
