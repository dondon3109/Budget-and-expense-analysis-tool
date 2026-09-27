import type {
  ProviderConfig,
  ProviderConfigAudit,
  ProviderCredentialWithUsage,
  ProviderService,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function getProviderConfigs(
  workspace: AuthenticatedWorkspace,
  service?: ProviderService,
): Promise<{ configs: ProviderConfig[] }> {
  const qs = service ? `?service=${encodeURIComponent(service)}` : "";
  return requestJson(workspace, `/api/app/admin/provider-configs${qs}`);
}

export function getProviderConfigAudits(
  workspace: AuthenticatedWorkspace,
  service?: ProviderService,
): Promise<{ audits: ProviderConfigAudit[] }> {
  const qs = service ? `?service=${encodeURIComponent(service)}` : "";
  return requestJson(workspace, `/api/app/admin/provider-configs/audits${qs}`);
}

export function getProviderHealth(workspace: AuthenticatedWorkspace): Promise<{
  health: Array<{
    service: ProviderService;
    provider: string;
    model: string;
    displayName?: string;
    configId?: string | null;
    hasCredential: boolean;
    credentialName: string | null;
    credentialId?: string | null;
    apiKeyLast4?: string | null;
    credentialSource?: "db" | "legacy" | "binding" | "none";
    details: string;
  }>;
}> {
  return requestJson(workspace, "/api/app/admin/provider-configs/health");
}

export function createProviderConfig(
  workspace: AuthenticatedWorkspace,
  input: {
    service: ProviderService;
    provider: string;
    model: string;
    displayName: string;
    credentialId?: string | null;
    enabled?: boolean;
  },
): Promise<ProviderConfig> {
  return requestJson(workspace, "/api/app/admin/provider-configs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProviderConfig(
  workspace: AuthenticatedWorkspace,
  id: string,
  patch: Partial<
    Pick<
      ProviderConfig,
      "provider" | "model" | "displayName" | "credentialId" | "enabled" | "priority"
    >
  >,
): Promise<ProviderConfig> {
  return requestJson(workspace, `/api/app/admin/provider-configs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function activateProviderConfig(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<ProviderConfig> {
  return requestJson(
    workspace,
    `/api/app/admin/provider-configs/${encodeURIComponent(id)}/activate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function deleteProviderConfig(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<ProviderConfig> {
  return requestJson(workspace, `/api/app/admin/provider-configs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function reorderProviderConfigs(
  workspace: AuthenticatedWorkspace,
  args: { service: ProviderService; orderedIds: string[] },
): Promise<{ configs: ProviderConfig[] }> {
  return requestJson(workspace, "/api/app/admin/provider-configs/reorder", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function getProviderCredentials(
  workspace: AuthenticatedWorkspace,
): Promise<{ credentials: ProviderCredentialWithUsage[] }> {
  return requestJson(workspace, "/api/app/admin/provider-credentials");
}

export function createProviderCredential(
  workspace: AuthenticatedWorkspace,
  input: { provider: string; name: string; secret: string },
): Promise<ProviderCredentialWithUsage> {
  return requestJson(workspace, "/api/app/admin/provider-credentials", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProviderCredential(
  workspace: AuthenticatedWorkspace,
  id: string,
  patch: { name?: string; secret?: string },
): Promise<ProviderCredentialWithUsage> {
  return requestJson(workspace, `/api/app/admin/provider-credentials/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteProviderCredential(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<{ deleted: true }> {
  return requestJson(workspace, `/api/app/admin/provider-credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function testProviderCredential(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<{ ok: true; provider: string; last4: string }> {
  return requestJson(
    workspace,
    `/api/app/admin/provider-credentials/${encodeURIComponent(id)}/test`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function previewProviderModels(
  workspace: AuthenticatedWorkspace,
  input: { provider: string; secret: string },
): Promise<{ provider: string; models: string[] }> {
  return requestJson(workspace, "/api/app/admin/provider-credentials/models", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listCredentialModels(
  workspace: AuthenticatedWorkspace,
  id: string,
): Promise<{ provider: string; models: string[] }> {
  return requestJson(
    workspace,
    `/api/app/admin/provider-credentials/${encodeURIComponent(id)}/models`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}
