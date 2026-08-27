import {
  providerCredentialCreateSchema,
  providerCredentialUpdateSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";
import type { ProviderCredentialRepository } from "../db/provider-credentials";
import { providerCredentialRepository } from "../db/provider-credentials";
import type { ProviderRegistry } from "../provider-registry";
import { providerRegistry } from "../provider-registry";
import type { PlatformAdminService } from "../platform-admin";
import { encryptSecret, getLast4, validateMasterKeyFormat } from "../provider-credentials/crypto";

export function createProviderCredentialRoutes(
  platformAdmins: PlatformAdminService,
  repository: ProviderCredentialRepository = providerCredentialRepository,
  registry: ProviderRegistry = providerRegistry,
) {
  const routes = new Hono<AppEnvironment>();

  // List credentials with usage
  routes.get("/", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const credentials = await repository.listWithUsage(context.env);
    // Never expose encrypted_secret — already masked in toCredential
    return context.json({ credentials });
  });

  routes.get("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const cred = await repository.getById(context.env, id);
    if (!cred) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    const usedBy = await repository.listUsagesForCredential(context.env, id);
    return context.json({ ...cred, usedBy });
  });

  routes.post("/", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const body = providerCredentialCreateSchema.safeParse(await readJson(context));
    if (!body.success) {
      throw new HttpError(400, "invalid_request", "Provide a valid credential.", body.error.flatten());
    }
    const master = context.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
    if (!validateMasterKeyFormat(master)) {
      throw new HttpError(500, "encryption_not_configured", "Credential encryption is not configured. Set PROVIDER_CREDENTIAL_ENCRYPTION_KEY.");
    }
    const encrypted = await encryptSecret(body.data.secret, master);
    const last4 = getLast4(body.data.secret);
    const created = await repository.create(
      context.env,
      { provider: body.data.provider, name: body.data.name, encryptedSecret: encrypted, apiKeyLast4: last4 },
      context.get("authUser").id,
    );
    // Invalidate cache for provider's service so health reflects new credential
    registry.invalidate();
    const usedBy = await repository.listUsagesForCredential(context.env, created.id);
    return context.json({ ...created, usedBy }, 201);
  });

  routes.patch("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const existing = await repository.getById(context.env, id);
    if (!existing) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    const body = providerCredentialUpdateSchema.safeParse(await readJson(context));
    if (!body.success) {
      throw new HttpError(400, "invalid_request", "Provide at least one change.", body.error.flatten());
    }
    const patch: { name?: string; encryptedSecret?: string; apiKeyLast4?: string } = {};
    if (body.data.name !== undefined) patch.name = body.data.name;
    if (body.data.secret !== undefined) {
      const master = context.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
      if (!validateMasterKeyFormat(master)) {
        throw new HttpError(500, "encryption_not_configured", "Credential encryption is not configured.");
      }
      patch.encryptedSecret = await encryptSecret(body.data.secret, master);
      patch.apiKeyLast4 = getLast4(body.data.secret);
    }
    const updated = await repository.update(context.env, id, patch, context.get("authUser").id);
    registry.invalidate();
    const usedBy = await repository.listUsagesForCredential(context.env, updated.id);
    return context.json({ ...updated, usedBy });
  });

  routes.delete("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    // repository.delete will throw 409 with usedBy if referenced
    await repository.delete(context.env, id);
    registry.invalidate();
    return context.json({ deleted: true });
  });

  // Test credential — verifies decryption + optional provider-specific cheap health check
  routes.post("/:id/test", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const row = await repository.getEncryptedById(context.env, id);
    if (!row) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    const master = context.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
    if (!validateMasterKeyFormat(master)) {
      throw new HttpError(500, "encryption_not_configured", "Credential encryption is not configured.");
    }
    // Verify we can decrypt — transient plaintext only in memory, never returned
    let plain: string;
    try {
      const { decryptSecret } = await import("../provider-credentials/crypto");
      plain = await decryptSecret(row.encrypted_secret, master);
    } catch {
      throw new HttpError(500, "credential_decrypt_failed", "Could not decrypt credential — check master key.");
    }
    if (!plain.trim()) throw new HttpError(400, "credential_invalid", "Credential is empty.");

    // Provider-specific cheap check: for now decrypt success is sufficient.
    // Future: for google(chirp_3) attempt ListLocations/StreamingRecognize 0-audio probe;
    // for deepseek/fish perform cheap model list with short timeout. All must remain $0 / non-billed.
    // We intentionally do not return plaintext, ciphertext, or external response bodies.
    void plain; // prevent unused

    return context.json({ ok: true, provider: row.provider, last4: row.api_key_last4 });
  });

  return routes;
}
