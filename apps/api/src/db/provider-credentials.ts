import type { ProviderCredential, ProviderCredentialWithUsage, ProviderService } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

export type ProviderCredentialRow = {
  id: string;
  provider: string;
  name: string;
  encrypted_secret: string;
  api_key_last4: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

function toCredential(row: ProviderCredentialRow): ProviderCredential {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    apiKeyLast4: row.api_key_last4,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export interface ProviderCredentialRepository {
  list(env: Bindings): Promise<ProviderCredential[]>;
  listWithUsage(env: Bindings): Promise<ProviderCredentialWithUsage[]>;
  getById(env: Bindings, id: string): Promise<ProviderCredential | null>;
  getEncryptedById(env: Bindings, id: string): Promise<ProviderCredentialRow | null>;
  create(
    env: Bindings,
    input: { provider: string; name: string; encryptedSecret: string; apiKeyLast4: string },
    actorId: string,
  ): Promise<ProviderCredential>;
  update(
    env: Bindings,
    id: string,
    patch: { name?: string; encryptedSecret?: string; apiKeyLast4?: string },
    actorId: string,
  ): Promise<ProviderCredential>;
  delete(env: Bindings, id: string): Promise<void>;
  countUsages(env: Bindings, credentialId: string): Promise<number>;
  listUsagesForCredential(
    env: Bindings,
    credentialId: string,
  ): Promise<ProviderCredentialWithUsage["usedBy"]>;
}

export const providerCredentialRepository: ProviderCredentialRepository = {
  async list(env) {
    const result = await env.DB.prepare(
      `SELECT id, provider, name, encrypted_secret, api_key_last4, created_at, updated_at, updated_by
       FROM provider_credentials ORDER BY provider ASC, name ASC`,
    ).all<ProviderCredentialRow>();
    return result.results.map(toCredential);
  },

  async listWithUsage(env) {
    const creds = await this.list(env);
    const withUsage: ProviderCredentialWithUsage[] = [];
    for (const cred of creds) {
      const usedBy = await this.listUsagesForCredential(env, cred.id);
      withUsage.push({ ...cred, usedBy });
    }
    return withUsage;
  },

  async getById(env, id) {
    const row = await env.DB.prepare(
      `SELECT id, provider, name, encrypted_secret, api_key_last4, created_at, updated_at, updated_by
       FROM provider_credentials WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<ProviderCredentialRow>();
    return row ? toCredential(row) : null;
  },

  async getEncryptedById(env, id) {
    const row = await env.DB.prepare(
      `SELECT id, provider, name, encrypted_secret, api_key_last4, created_at, updated_at, updated_by
       FROM provider_credentials WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<ProviderCredentialRow>();
    return row ?? null;
  },

  async create(env, input, actorId) {
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO provider_credentials (id, provider, name, encrypted_secret, api_key_last4, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
      )
        .bind(id, input.provider, input.name, input.encryptedSecret, input.apiKeyLast4, actorId)
        .run();
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (msg.includes("provider_credentials_provider_name_unique") || msg.includes("unique")) {
        throw new HttpError(409, "credential_name_exists", "A credential with this provider and name already exists.");
      }
      throw error;
    }
    const created = await this.getById(env, id);
    if (!created) throw new HttpError(500, "credential_create_failed", "Could not create credential.");
    return created;
  },

  async update(env, id, patch, actorId) {
    const existing = await this.getEncryptedById(env, id);
    if (!existing) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    const nextName = patch.name ?? existing.name;
    const nextEncrypted = patch.encryptedSecret ?? existing.encrypted_secret;
    const nextLast4 = patch.apiKeyLast4 ?? existing.api_key_last4;
    try {
      await env.DB.prepare(
        `UPDATE provider_credentials SET name = ?, encrypted_secret = ?, api_key_last4 = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(nextName, nextEncrypted, nextLast4, actorId, id)
        .run();
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (msg.includes("provider_credentials_provider_name_unique") || msg.includes("unique")) {
        throw new HttpError(409, "credential_name_exists", "A credential with this provider and name already exists.");
      }
      throw error;
    }
    const updated = await this.getById(env, id);
    if (!updated) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    return updated;
  },

  async delete(env, id) {
    const count = await this.countUsages(env, id);
    if (count > 0) {
      const usages = await this.listUsagesForCredential(env, id);
      throw new HttpError(409, "credential_in_use", "Credential is still referenced by configurations.", { usedBy: usages });
    }
    const existing = await this.getById(env, id);
    if (!existing) throw new HttpError(404, "credential_not_found", "Credential was not found.");
    await env.DB.prepare(`DELETE FROM provider_credentials WHERE id = ?`).bind(id).run();
  },

  async countUsages(env, credentialId) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM provider_configs WHERE credential_id = ?`,
    )
      .bind(credentialId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  },

  async listUsagesForCredential(env, credentialId) {
    const result = await env.DB.prepare(
      `SELECT id, service, provider, model, display_name, is_active
       FROM provider_configs WHERE credential_id = ? ORDER BY service ASC, priority ASC`,
    )
      .bind(credentialId)
      .all<{ id: string; service: ProviderService; provider: string; model: string; display_name: string; is_active: number }>();
    return result.results.map((r) => ({
      configId: r.id,
      service: r.service,
      provider: r.provider,
      model: r.model,
      displayName: r.display_name,
      isActive: Boolean(r.is_active),
    }));
  },
};
