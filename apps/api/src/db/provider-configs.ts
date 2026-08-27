import type { ProviderConfig, ProviderService } from "@zoption/shared";

import { HttpError } from "../errors";
import type { Bindings } from "../types";

export type ProviderConfigRow = {
  id: string;
  service: ProviderService;
  provider: string;
  model: string;
  display_name: string;
  credential_id: string | null;
  enabled: number;
  priority: number;
  is_active: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderConfigAuditRow = {
  id: string;
  config_id: string | null;
  service: ProviderService;
  action: "create" | "update" | "activate" | "deactivate" | "delete" | "reorder";
  old_value_json: string | null;
  new_value_json: string | null;
  changed_by: string;
  created_at: string;
};

function toProviderConfig(row: ProviderConfigRow): ProviderConfig {
  return {
    id: row.id,
    service: row.service,
    provider: row.provider,
    model: row.model,
    displayName: row.display_name ?? `${row.provider} / ${row.model}`,
    credentialId: row.credential_id ?? null,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export interface ProviderConfigRepository {
  list(env: Bindings, service?: ProviderService): Promise<ProviderConfig[]>;
  getById(env: Bindings, id: string): Promise<ProviderConfig | null>;
  getActive(env: Bindings, service: ProviderService): Promise<ProviderConfig | null>;
  create(
    env: Bindings,
    input: {
      service: ProviderService;
      provider: string;
      model: string;
      displayName: string;
      credentialId?: string | null;
      enabled?: boolean;
      priority?: number;
    },
    actorId: string,
  ): Promise<ProviderConfig>;
  update(
    env: Bindings,
    id: string,
    patch: {
      provider?: string;
      model?: string;
      displayName?: string;
      credentialId?: string | null;
      enabled?: boolean;
      priority?: number;
    },
    actorId: string,
  ): Promise<ProviderConfig>;
  setActive(env: Bindings, id: string, actorId: string): Promise<ProviderConfig>;
  reorder(
    env: Bindings,
    service: ProviderService,
    orderedIds: string[],
    actorId: string,
  ): Promise<ProviderConfig[]>;
  delete(env: Bindings, id: string, actorId: string): Promise<ProviderConfig>;
  listAudits(env: Bindings, service?: ProviderService, limit?: number): Promise<ProviderConfigAuditRow[]>;
}

function auditPayload(config: ProviderConfig | null): string | null {
  return config ? JSON.stringify(config) : null;
}

async function insertAudit(
  env: Bindings,
  input: {
    configId: string | null;
    service: ProviderService;
    action: ProviderConfigAuditRow["action"];
    oldValue: ProviderConfig | null;
    newValue: ProviderConfig | null;
    changedBy: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO provider_config_audits (id, config_id, service, action, old_value_json, new_value_json, changed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  )
    .bind(
      crypto.randomUUID(),
      input.configId,
      input.service,
      input.action,
      auditPayload(input.oldValue),
      auditPayload(input.newValue),
      input.changedBy,
    )
    .run();
}

export const providerConfigRepository: ProviderConfigRepository = {
  async list(env, service) {
    // Fallback for pre-migration DB where display_name/credential_id columns do not yet exist
    const tryWithNewColumns = async () => {
      const query = service
        ? env.DB.prepare(
            `SELECT id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by, created_at, updated_at
             FROM provider_configs WHERE service = ? ORDER BY priority ASC, updated_at DESC`,
          ).bind(service)
        : env.DB.prepare(
            `SELECT id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by, created_at, updated_at
             FROM provider_configs ORDER BY service ASC, priority ASC`,
          );
      const result = await query.all<ProviderConfigRow>();
      return result.results.map(toProviderConfig);
    };
    try {
      return await tryWithNewColumns();
    } catch {
      // Legacy: columns missing before migration 0047
      const query = service
        ? env.DB.prepare(
            `SELECT id, service, provider, model, enabled, priority, is_active, updated_by, created_at, updated_at
             FROM provider_configs WHERE service = ? ORDER BY priority ASC, updated_at DESC`,
          ).bind(service)
        : env.DB.prepare(
            `SELECT id, service, provider, model, enabled, priority, is_active, updated_by, created_at, updated_at
             FROM provider_configs ORDER BY service ASC, priority ASC`,
          );
      const result = await query.all<ProviderConfigRow>();
      return result.results.map(toProviderConfig);
    }
  },

  async getById(env, id) {
    try {
      const row = await env.DB.prepare(
        `SELECT id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by, created_at, updated_at
         FROM provider_configs WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first<ProviderConfigRow>();
      return row ? toProviderConfig(row) : null;
    } catch {
      const row = await env.DB.prepare(
        `SELECT id, service, provider, model, enabled, priority, is_active, updated_by, created_at, updated_at
         FROM provider_configs WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first<ProviderConfigRow>();
      return row ? toProviderConfig(row) : null;
    }
  },

  async getActive(env, service) {
    try {
      const row = await env.DB.prepare(
        `SELECT id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by, created_at, updated_at
         FROM provider_configs WHERE service = ? AND is_active = 1 LIMIT 1`,
      )
        .bind(service)
        .first<ProviderConfigRow>();
      return row ? toProviderConfig(row) : null;
    } catch {
      const row = await env.DB.prepare(
        `SELECT id, service, provider, model, enabled, priority, is_active, updated_by, created_at, updated_at
         FROM provider_configs WHERE service = ? AND is_active = 1 LIMIT 1`,
      )
        .bind(service)
        .first<ProviderConfigRow>();
      return row ? toProviderConfig(row) : null;
    }
  },

  async create(env, input, actorId) {
    const maxPriorityRow = await env.DB.prepare(
      `SELECT COALESCE(MAX(priority), 0) as maxPriority FROM provider_configs WHERE service = ?`,
    )
      .bind(input.service)
      .first<{ maxPriority: number }>();
    const priority = input.priority ?? (maxPriorityRow ? maxPriorityRow.maxPriority + 1 : 1);
    const id = crypto.randomUUID();
    const displayName = (input.displayName?.trim() || `${input.provider} / ${input.model}`).slice(0, 40);
    try {
      // Try new columns; fallback to legacy for pre-migration
      try {
        await env.DB.prepare(
          `INSERT INTO provider_configs (id, service, provider, model, display_name, credential_id, enabled, priority, is_active, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
        )
          .bind(id, input.service, input.provider, input.model, displayName, input.credentialId ?? null, (input.enabled ?? true) ? 1 : 0, priority, actorId)
          .run();
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (msg.includes("no column named") || msg.includes("has no column named")) {
          await env.DB.prepare(
            `INSERT INTO provider_configs (id, service, provider, model, enabled, priority, is_active, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`,
          )
            .bind(id, input.service, input.provider, input.model, (input.enabled ?? true) ? 1 : 0, priority, actorId)
            .run();
        } else throw e;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (msg.includes("provider_configs_service_provider_model_unique") || msg.includes("unique")) {
        throw new HttpError(409, "provider_config_duplicate", "This provider and model already exists for this service.");
      }
      throw error;
    }
    const created = await this.getById(env, id);
    if (!created) throw new HttpError(500, "provider_config_create_failed", "Could not create provider configuration.");
    await insertAudit(env, {
      configId: id,
      service: input.service,
      action: "create",
      oldValue: null,
      newValue: created,
      changedBy: actorId,
    });
    return created;
  },

  async update(env, id, patch, actorId) {
    const existing = await this.getById(env, id);
    if (!existing) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");

    const nextProvider = patch.provider ?? existing.provider;
    const nextModel = patch.model ?? existing.model;
    const nextEnabled = patch.enabled !== undefined ? patch.enabled : existing.enabled;
    const nextPriority = patch.priority ?? existing.priority;
    const nextDisplayName = patch.displayName?.trim() ?? existing.displayName;
    const nextCredentialId = patch.credentialId !== undefined ? patch.credentialId : existing.credentialId;

    // Prevent disabling the active config without switching active
    if (existing.isActive && patch.enabled === false) {
      throw new HttpError(
        409,
        "cannot_disable_active_provider",
        "Deactivate the provider by activating another one first.",
      );
    }

    try {
      try {
        await env.DB.prepare(
          `UPDATE provider_configs SET provider = ?, model = ?, display_name = ?, credential_id = ?, enabled = ?, priority = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(nextProvider, nextModel, nextDisplayName, nextCredentialId, nextEnabled ? 1 : 0, nextPriority, actorId, id)
          .run();
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (msg.includes("no column named") || msg.includes("has no column named")) {
          await env.DB.prepare(
            `UPDATE provider_configs SET provider = ?, model = ?, enabled = ?, priority = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          )
            .bind(nextProvider, nextModel, nextEnabled ? 1 : 0, nextPriority, actorId, id)
            .run();
        } else throw e;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message.toLowerCase() : "";
      if (msg.includes("provider_configs_service_provider_model_unique") || msg.includes("unique")) {
        throw new HttpError(409, "provider_config_duplicate", "This provider and model already exists for this service.");
      }
      throw error;
    }
    const updated = await this.getById(env, id);
    if (!updated) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    await insertAudit(env, {
      configId: id,
      service: existing.service,
      action: "update",
      oldValue: existing,
      newValue: updated,
      changedBy: actorId,
    });
    return updated;
  },

  async setActive(env, id, actorId) {
    const target = await this.getById(env, id);
    if (!target) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    if (!target.enabled) {
      throw new HttpError(409, "provider_not_enabled", "Enable the provider before activating it.");
    }
    const previous = await this.getActive(env, target.service);
    // Use a transaction via batch to ensure atomic switch
    const stmts: D1PreparedStatement[] = [];
    if (previous && previous.id !== id) {
      stmts.push(
        env.DB.prepare(
          `UPDATE provider_configs SET is_active = 0, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(actorId, previous.id),
      );
    }
    stmts.push(
      env.DB.prepare(
        `UPDATE provider_configs SET is_active = 1, enabled = 1, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(actorId, id),
    );
    await env.DB.batch(stmts);
    const activated = await this.getById(env, id);
    if (!activated) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    if (previous && previous.id !== id) {
      const prevAfter = await this.getById(env, previous.id);
      await insertAudit(env, {
        configId: previous.id,
        service: target.service,
        action: "deactivate",
        oldValue: previous,
        newValue: prevAfter,
        changedBy: actorId,
      });
    }
    await insertAudit(env, {
      configId: id,
      service: target.service,
      action: "activate",
      oldValue: target,
      newValue: activated,
      changedBy: actorId,
    });
    return activated;
  },

  async reorder(env, service, orderedIds, actorId) {
    const existing = await this.list(env, service);
    if (existing.length !== orderedIds.length) {
      throw new HttpError(400, "invalid_reorder", "Provide every config ID for this service exactly once.");
    }
    const existingIds = new Set(existing.map((c) => c.id));
    for (const oid of orderedIds) {
      if (!existingIds.has(oid)) {
        throw new HttpError(400, "invalid_reorder", "One or more config IDs are invalid for this service.");
      }
    }
    const batch = orderedIds.map((oid, idx) =>
      env.DB.prepare(
        `UPDATE provider_configs SET priority = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ? AND service = ?`,
      ).bind(idx + 1, actorId, oid, service),
    );
    await env.DB.batch(batch);
    const reordered = await this.list(env, service);
    await insertAudit(env, {
      configId: null,
      service,
      action: "reorder",
      oldValue: null,
      newValue: null,
      changedBy: actorId,
    });
    return reordered;
  },

  async delete(env, id, actorId) {
    const existing = await this.getById(env, id);
    if (!existing) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    if (existing.isActive) {
      throw new HttpError(409, "cannot_delete_active_config", "Activate a different configuration before deleting this active one.");
    }
    await env.DB.prepare(`DELETE FROM provider_configs WHERE id = ?`).bind(id).run();
    await insertAudit(env, {
      configId: id,
      service: existing.service,
      action: "delete",
      oldValue: existing,
      newValue: null,
      changedBy: actorId,
    });
    return existing;
  },

  async listAudits(env, service, limit = 50) {
    const capped = Math.min(Math.max(limit, 1), 100);
    if (service) {
      const result = await env.DB.prepare(
        `SELECT id, config_id, service, action, old_value_json, new_value_json, changed_by, created_at
         FROM provider_config_audits WHERE service = ? ORDER BY created_at DESC LIMIT ?`,
      )
        .bind(service, capped)
        .all<ProviderConfigAuditRow>();
      return result.results;
    }
    const result = await env.DB.prepare(
      `SELECT id, config_id, service, action, old_value_json, new_value_json, changed_by, created_at
       FROM provider_config_audits ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(capped)
      .all<ProviderConfigAuditRow>();
    return result.results;
  },
};
