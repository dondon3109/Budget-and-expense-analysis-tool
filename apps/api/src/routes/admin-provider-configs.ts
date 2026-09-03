import {
  providerConfigCreateSchema,
  providerConfigReorderSchema,
  providerConfigUpdateSchema,
  providerServiceSchema,
} from "@zoption/shared";
import { Hono } from "hono";

import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";
import type { ProviderConfigRepository } from "../db/provider-configs";
import { providerConfigRepository } from "../db/provider-configs";
import type { ProviderCredentialRepository } from "../db/provider-credentials";
import { providerCredentialRepository } from "../db/provider-credentials";
import type { ProviderRegistry } from "../provider-registry";
import { providerRegistry } from "../provider-registry";
import type { PlatformAdminService } from "../platform-admin";

import type { ProviderService } from "@zoption/shared";

function parseService(value: string | undefined): ProviderService | undefined {
  if (!value) return undefined;
  const parsed = providerServiceSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "invalid_request", "Unknown provider service.");
  return parsed.data;
}

const CREDENTIAL_REQUIRED: Record<ProviderService, Record<string, boolean>> = {
  assistant: {
    deepseek: true,
    openai: true,
    anthropic: true,
    gemini: true,
    meta: true,
    muse_spark: true,
  },
  // google via Cloud Run bridge uses ADC — no credential required at runtime
  stt: { cloudflare_workers_ai: false, google: false },
  tts: { fish_audio: true },
};

function expectsCredential(service: ProviderService, provider: string): boolean {
  return CREDENTIAL_REQUIRED[service]?.[provider] ?? true;
}

export function createAdminProviderConfigRoutes(
  platformAdmins: PlatformAdminService,
  repository: ProviderConfigRepository = providerConfigRepository,
  registry: ProviderRegistry = providerRegistry,
  credentialRepository: ProviderCredentialRepository = providerCredentialRepository,
) {
  const routes = new Hono<AppEnvironment>();

  // List configs (grouped)
  routes.get("/", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const service = parseService(context.req.query("service"));
    const configs = await repository.list(context.env, service);
    return context.json({ configs });
  });

  // List audits
  routes.get("/audits", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const service = parseService(context.req.query("service"));
    const limitRaw = context.req.query("limit");
    const limit = limitRaw ? Number(limitRaw) : 50;
    const auditsRaw = await repository.listAudits(context.env, service, Number.isFinite(limit) ? limit : 50);
    // Parse JSON strings safely for frontend; never expose secrets (configs contain no secrets)
    const audits = auditsRaw.map((row) => ({
      id: row.id,
      configId: row.config_id,
      service: row.service,
      action: row.action,
      oldValue: row.old_value_json ? (JSON.parse(row.old_value_json) as unknown) : null,
      newValue: row.new_value_json ? (JSON.parse(row.new_value_json) as unknown) : null,
      changedBy: row.changed_by,
      createdAt: row.created_at,
    }));
    return context.json({ audits });
  });

  routes.get("/health", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const health = await registry.getHealth(context.env);
    return context.json({ health });
  });

  routes.get("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const config = await repository.getById(context.env, id);
    if (!config) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    return context.json(config);
  });

  routes.post("/", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const body = providerConfigCreateSchema.safeParse(await readJson(context));
    if (!body.success) {
      throw new HttpError(400, "invalid_request", "Provide a valid provider and model.", body.error.flatten());
    }
    if (!registry.validateAllowlist(body.data.service, body.data.provider, body.data.model)) {
      throw new HttpError(400, "invalid_provider_model", "Unsupported provider or model for this service.");
    }
    const needsCred = expectsCredential(body.data.service, body.data.provider);
    const credentialId = body.data.credentialId ?? null;
    if (needsCred && !credentialId) {
      throw new HttpError(400, "credential_required", "This provider requires a credential.");
    }
    // cloudflare binding never uses a credential; google via bridge uses ADC (optional credential for REST health-check only)
    if (body.data.provider === "cloudflare_workers_ai" && credentialId) {
      throw new HttpError(400, "credential_not_allowed", "This provider does not use a credential.");
    }
    if (credentialId) {
      const cred = await credentialRepository.getById(context.env, credentialId);
      if (!cred) throw new HttpError(404, "credential_not_found", "Credential was not found.");
      if (cred.provider !== body.data.provider) {
        throw new HttpError(400, "credential_provider_mismatch", "Credential provider must match configuration provider.");
      }
    }
    const created = await repository.create(context.env, body.data as never, context.get("authUser").id);
    registry.invalidate(body.data.service);
    return context.json(created, 201);
  });

  routes.patch("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const existing = await repository.getById(context.env, id);
    if (!existing) throw new HttpError(404, "provider_config_not_found", "Provider configuration was not found.");
    const body = providerConfigUpdateSchema.safeParse(await readJson(context));
    if (!body.success) {
      throw new HttpError(400, "invalid_request", "Provide at least one valid change.", body.error.flatten());
    }
    const nextProvider = body.data.provider ?? existing.provider;
    const nextModel = body.data.model ?? existing.model;
    const nextCredentialId = body.data.credentialId !== undefined ? body.data.credentialId : existing.credentialId;
    // Validate allowlist if provider or model changes
    if ((body.data.provider !== undefined || body.data.model !== undefined) && !registry.validateAllowlist(existing.service, nextProvider, nextModel)) {
      throw new HttpError(400, "invalid_provider_model", "Unsupported provider or model for this service.");
    }
    // Validate credential ↔ provider consistency
    const needsCred = expectsCredential(existing.service, nextProvider);
    if (needsCred && !nextCredentialId) {
      throw new HttpError(400, "credential_required", "This provider requires a credential.");
    }
    if (nextProvider === "cloudflare_workers_ai" && nextCredentialId) {
      throw new HttpError(400, "credential_not_allowed", "This provider does not use a credential.");
    }
    if (nextCredentialId) {
      const cred = await credentialRepository.getById(context.env, nextCredentialId);
      if (!cred) throw new HttpError(404, "credential_not_found", "Credential was not found.");
      if (cred.provider !== nextProvider) {
        throw new HttpError(400, "credential_provider_mismatch", "Credential provider must match configuration provider.");
      }
    }
    const updated = await repository.update(context.env, id, body.data, context.get("authUser").id);
    registry.invalidate(existing.service);
    return context.json(updated);
  });

  routes.post("/:id/activate", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const activated = await repository.setActive(context.env, id, context.get("authUser").id);
    registry.invalidate(activated.service);
    return context.json(activated);
  });

  routes.post("/reorder", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const body = providerConfigReorderSchema.safeParse(await readJson(context));
    if (!body.success) {
      throw new HttpError(400, "invalid_request", "Provide orderedIds for a service.", body.error.flatten());
    }
    const reordered = await repository.reorder(context.env, body.data.service, body.data.orderedIds, context.get("authUser").id);
    registry.invalidate(body.data.service);
    return context.json({ configs: reordered });
  });

  routes.delete("/:id", async (context) => {
    await platformAdmins.requireAdmin(context.env, context.get("authUser").id);
    const id = context.req.param("id");
    const deleted = await repository.delete(context.env, id, context.get("authUser").id);
    registry.invalidate(deleted.service);
    return context.json(deleted);
  });

  return routes;
}
