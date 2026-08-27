import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Plus,
  KeyRound,
  Cpu,
  Trash2,
  TestTube,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  activateProviderConfig,
  createProviderConfig,
  createProviderCredential,
  deleteProviderCredential,
  getProviderConfigAudits,
  getProviderConfigs,
  getProviderCredentials,
  getProviderHealth,
  reorderProviderConfigs,
  testProviderCredential,
  updateProviderConfig,
  updateProviderCredential,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import { providerAllowlist } from "@zoption/shared";
import type { ProviderConfig, ProviderCredentialWithUsage, ProviderService } from "@zoption/shared";
import "./AdminProviderConfigsPage.css";

const SERVICES: { id: ProviderService; label: string; description: string }[] = [
  { id: "assistant", label: "AI Assistant", description: "Primary conversational assistant model used for all Zoption AI answers." },
  { id: "stt", label: "Voice Input · STT", description: "Speech-to-text model for voice recordings." },
  { id: "tts", label: "Voice Output · TTS", description: "Text-to-speech model for spoken replies and previews." },
];

const SERVICE_CREDENTIALS: Record<ProviderService, { label: string; expectsKey: boolean }> = {
  assistant: { label: "DeepSeek", expectsKey: true },
  // google STT via Cloud Run bridge uses ADC — no admin credential at runtime; health uses STT_BRIDGE_URL
  stt: { label: "STT bridge", expectsKey: false },
  tts: { label: "Fish Audio", expectsKey: true },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function AdminProviderConfigsPage() {
  const { user } = useAuth();
  const workspace = userWorkspace(user!);
  const billing = useBillingSummary(workspace);
  const isAdmin = billing.data?.canManageSponsoredSeats === true;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string>();
  const [errorMsg, setErrorMsg] = useState<string>();
  const [confirmActivate, setConfirmActivate] = useState<ProviderConfig | null>(null);
  const [addFor, setAddFor] = useState<ProviderService | null>(null);
  const [addProvider, setAddProvider] = useState<string>("");
  const [addModel, setAddModel] = useState<string>("");
  const [addDisplayName, setAddDisplayName] = useState<string>("");
  const [addCredentialId, setAddCredentialId] = useState<string>("");

  // Credential dialog state
  const [showAddCred, setShowAddCred] = useState(false);
  const [credProvider, setCredProvider] = useState<string>("deepseek");
  const [credName, setCredName] = useState<string>("");
  const [credSecret, setCredSecret] = useState<string>("");
  const [editCred, setEditCred] = useState<ProviderCredentialWithUsage | null>(null);
  const [editCredName, setEditCredName] = useState<string>("");
  const [editCredSecret, setEditCredSecret] = useState<string>("");
  const [deleteCred, setDeleteCred] = useState<ProviderCredentialWithUsage | null>(null);

  const configsQuery = useQuery({
    queryKey: queryKeys.providerConfigs(workspace),
    queryFn: () => getProviderConfigs(workspace),
    enabled: isAdmin,
    refetchInterval: 15_000,
  });

  const credentialsQuery = useQuery({
    queryKey: queryKeys.providerCredentials(workspace),
    queryFn: () => getProviderCredentials(workspace),
    enabled: isAdmin,
    refetchInterval: 15_000,
  });

  const auditsQuery = useQuery({
    queryKey: queryKeys.providerConfigAudits(workspace),
    queryFn: () => getProviderConfigAudits(workspace),
    enabled: isAdmin,
  });

  const healthQuery = useQuery({
    queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
    queryFn: () => getProviderHealth(workspace),
    enabled: isAdmin,
    refetchInterval: 20_000,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => activateProviderConfig(workspace, id),
    onSuccess: (updated) => {
      setFeedback(`Activated ${updated.service} → ${updated.displayName ?? `${updated.provider} / ${updated.model}`}`);
      setErrorMsg(undefined);
      setConfirmActivate(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Activation failed."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateProviderConfig(workspace, id, { enabled }),
    onSuccess: () => {
      setFeedback("Updated enabled state.");
      setErrorMsg(undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Update failed."),
  });

  const reorderMutation = useMutation({
    mutationFn: (args: { service: ProviderService; orderedIds: string[] }) =>
      reorderProviderConfigs(workspace, args),
    onSuccess: () => {
      setFeedback("Fallback order updated.");
      setErrorMsg(undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Reorder failed."),
  });

  const createMutation = useMutation({
    mutationFn: (input: { service: ProviderService; provider: string; model: string; displayName: string; credentialId?: string | null }) =>
      createProviderConfig(workspace, input),
    onSuccess: (created) => {
      setFeedback(`Added ${created.service} → ${created.displayName}`);
      setErrorMsg(undefined);
      setAddFor(null);
      setAddProvider("");
      setAddModel("");
      setAddDisplayName("");
      setAddCredentialId("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Create failed."),
  });

  const createCredMutation = useMutation({
    mutationFn: (input: { provider: string; name: string; secret: string }) =>
      createProviderCredential(workspace, input),
    onSuccess: (c) => {
      setFeedback(`Created credential ${c.provider} / ${c.name} ••••${c.apiKeyLast4}`);
      setErrorMsg(undefined);
      setShowAddCred(false);
      setCredName("");
      setCredSecret("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Create credential failed."),
  });

  const updateCredMutation = useMutation({
    mutationFn: (input: { id: string; name?: string; secret?: string }) =>
      updateProviderCredential(workspace, input.id, { ...(input.name ? { name: input.name } : {}), ...(input.secret ? { secret: input.secret } : {}) }),
    onSuccess: (c) => {
      setFeedback(`Updated credential ${c.name} ••••${c.apiKeyLast4}`);
      setErrorMsg(undefined);
      setEditCred(null);
      setEditCredName("");
      setEditCredSecret("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Update credential failed."),
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => deleteProviderCredential(workspace, id),
    onSuccess: () => {
      setFeedback("Credential deleted.");
      setErrorMsg(undefined);
      setDeleteCred(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Delete credential failed."),
  });

  const testCredMutation = useMutation({
    mutationFn: (id: string) => testProviderCredential(workspace, id),
    onSuccess: (res) => {
      setFeedback(`Credential test ok: ${res.provider} ••••${res.last4}`);
      setErrorMsg(undefined);
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Credential test failed."),
  });

  function move(service: ProviderService, configs: ProviderConfig[], fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= configs.length) return;
    const ordered = [...configs];
    const [moved] = ordered.splice(fromIndex, 1);
    if (!moved) return;
    ordered.splice(toIndex, 0, moved);
    const orderedIds = ordered.map((c) => c.id);
    reorderMutation.mutate({ service, orderedIds });
  }

  const configsByService = useMemo(() => {
    const map = new Map<ProviderService, ProviderConfig[]>();
    for (const svc of SERVICES) map.set(svc.id, []);
    for (const cfg of configsQuery.data?.configs ?? []) {
      const arr = map.get(cfg.service);
      if (arr) arr.push(cfg);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.priority - b.priority);
    return map;
  }, [configsQuery.data?.configs]);

  const credentialsByProvider = useMemo(() => {
    const map = new Map<string, ProviderCredentialWithUsage[]>();
    for (const c of credentialsQuery.data?.credentials ?? []) {
      const arr = map.get(c.provider) ?? [];
      arr.push(c);
      map.set(c.provider, arr);
    }
    return map;
  }, [credentialsQuery.data?.credentials]);

  const healthByService = useMemo(() => {
    const map = new Map<ProviderService, { hasCredential: boolean; details: string; apiKeyLast4?: string | null; source?: string }>();
    for (const h of healthQuery.data?.health ?? []) map.set(h.service, h as unknown as { hasCredential: boolean; details: string; apiKeyLast4?: string | null; source?: string });
    return map;
  }, [healthQuery.data?.health]);

  function availableProviders(service: ProviderService): string[] {
    return Object.keys(providerAllowlist[service] ?? {});
  }

  function availableModels(service: ProviderService, provider: string): string[] {
    const models = (providerAllowlist[service] as Record<string, readonly string[]> | undefined)?.[provider] as readonly string[] | undefined;
    return models ? [...models] : [];
  }

  function remainingModels(service: ProviderService, provider: string, existing: ProviderConfig[]): string[] {
    const all = availableModels(service, provider);
    const used = new Set(existing.filter((c) => c.provider === provider).map((c) => c.model));
    return all.filter((m) => !used.has(m));
  }

  function openAdd(service: ProviderService) {
    const providers = availableProviders(service);
    const firstProvider = providers[0] ?? "";
    const existing = configsByService.get(service) ?? [];
    const models = firstProvider ? remainingModels(service, firstProvider, existing) : [];
    let provider = firstProvider;
    let model = models[0] ?? "";
    if (!model) {
      for (const p of providers) {
        const rem = remainingModels(service, p, existing);
        if (rem.length) {
          provider = p;
          model = rem[0]!;
          break;
        }
      }
    }
    setAddProvider(provider);
    setAddModel(model);
    setAddDisplayName(provider && model ? `${provider} / ${model}` : "");
    const creds = credentialsByProvider.get(provider) ?? [];
    setAddCredentialId(creds[0]?.id ?? "");
    setAddFor(service);
    setErrorMsg(undefined);
  }

  return (
    <AppShell>
      <div className="admin-provider-page">
        <header className="admin-provider-header">
          <div>
            <p>Platform Administration</p>
            <h1>AI & Voice Models</h1>
            <span>
              Manage reusable credentials and provider configurations. Credentials are encrypted with AES-256-GCM and never shown in full. Configurations reuse credentials by provider. Active changes affect all users immediately (registry cache invalidated) with ~30s TTL as fallback. Manual switching only — no automatic fallback.
            </span>
          </div>
          <div className="admin-provider-header-actions">
            <Link to="/app/settings" className="button secondary">
              Back to settings
            </Link>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                void configsQuery.refetch();
                void credentialsQuery.refetch();
                void auditsQuery.refetch();
                void healthQuery.refetch();
              }}
              aria-label="Refresh"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        {billing.isPending ? (
          <div className="admin-provider-state">Checking platform administrator access…</div>
        ) : billing.isError ? (
          <div className="admin-provider-state">Administrator access could not be checked. Try again.</div>
        ) : !isAdmin ? (
          <div className="admin-provider-access">
            <ShieldCheck size={28} />
            <h1>Platform administrator access required</h1>
            <p>Only the platform administrator can manage AI and voice models.</p>
            <Link to="/app" className="button">
              Return to dashboard
            </Link>
          </div>
        ) : configsQuery.isPending ? (
          <div className="admin-provider-state">Loading provider configurations…</div>
        ) : configsQuery.isError ? (
          <div className="admin-provider-state">Could not load configurations. Try again.</div>
        ) : (
          <>
            {feedback && <div className="admin-provider-feedback success">{feedback}</div>}
            {errorMsg && <div className="admin-provider-feedback error">{errorMsg}</div>}

            <div className="admin-provider-notice">
              <AlertTriangle size={16} /> Fallback order is displayed for operational visibility only. This release
              does not auto-retry across providers — switch the active model manually if a provider has an outage.
            </div>

            {/* Credentials section */}
            <section className="admin-provider-section">
              <div className="admin-provider-section-heading">
                <div>
                  <h2>Credentials</h2>
                  <p>Reusable encrypted secrets. Name + ••••last4 shown only. One credential can be reused by multiple configurations of the same provider.</p>
                </div>
                <span>
                  <button type="button" className="button secondary compact" onClick={() => setShowAddCred(true)}>
                    <Plus size={14} /> Add credential
                  </button>
                </span>
              </div>
              {credentialsQuery.isPending ? (
                <div className="admin-provider-state">Loading credentials…</div>
              ) : (credentialsQuery.data?.credentials.length ?? 0) === 0 ? (
                <div className="admin-provider-empty">No credentials yet. Add a credential to create provider configurations that require secrets.</div>
              ) : (
                <div className="admin-provider-table-wrap">
                  <table className="admin-provider-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Name</th>
                        <th>Secret</th>
                        <th>Used by</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(credentialsQuery.data?.credentials ?? []).map((cred) => (
                        <tr key={cred.id}>
                          <td><strong>{cred.provider}</strong><small className="mono">{shortId(cred.id)}</small></td>
                          <td>{cred.name}</td>
                          <td><code>••••{cred.apiKeyLast4}</code></td>
                          <td>
                            {cred.usedBy.length === 0 ? (
                              <small>unused</small>
                            ) : (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {cred.usedBy.map((u) => (
                                  <span key={u.configId} className={`provider-status ${u.isActive ? "enabled" : "disabled"}`} title={`${u.service} • ${u.displayName} • ${u.provider}/${u.model}`}>
                                    {u.displayName} {u.isActive ? "●" : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td><span>{formatDate(cred.updatedAt)}</span></td>
                          <td>
                            <div className="provider-actions">
                              <button type="button" className="button small secondary" onClick={() => testCredMutation.mutate(cred.id)} disabled={testCredMutation.isPending} title="Test credential (decrypt + cheap provider check)"><TestTube size={12} /> Test</button>
                              <button type="button" className="button small secondary" onClick={() => { setEditCred(cred); setEditCredName(cred.name); setEditCredSecret(""); }}><Pencil size={12} /> Edit</button>
                              <button type="button" className="button small secondary" onClick={() => setDeleteCred(cred)}><Trash2 size={12} /> Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {SERVICES.map((svc) => {
              const list = configsByService.get(svc.id) ?? [];
              const active = list.find((c) => c.isActive);
              const health = healthByService.get(svc.id);
              const cred = SERVICE_CREDENTIALS[svc.id];
              return (
                <section key={svc.id} className="admin-provider-section">
                  <div className="admin-provider-section-heading">
                    <div>
                      <h2>{svc.label}</h2>
                      <p>{svc.description}</p>
                    </div>
                    <span>
                      Active: {active ? `${active.displayName} (${active.provider} / ${active.model})` : "none"}
                      {health ? (
                        <small
                          className={`health-badge ${health.hasCredential ? "ok" : "missing"}`}
                          title={health.details}
                        >
                          {svc.id === "stt" && active?.provider === "cloudflare_workers_ai"
                            ? health.hasCredential
                              ? "● Binding ready"
                              : "○ Binding missing"
                            : health.hasCredential
                              ? `● Credential ••••${health.apiKeyLast4 ?? ""}`
                              : "○ Credential missing"}
                        </small>
                      ) : null}
                    </span>
                  </div>

                  <div className="admin-provider-section-actions">
                    <button type="button" className="button secondary compact" onClick={() => openAdd(svc.id)}>
                      <Plus size={14} /> Add configuration
                    </button>
                    {cred.expectsKey ? (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        Configurations require a {svc.id === "stt" ? "STT" : svc.label} credential of matching provider.
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, opacity: 0.7 }}><Cpu size={14} /> Binding info</span>
                    )}
                  </div>

                  {list.length === 0 ? (
                    <div className="admin-provider-empty">No configurations for this service.</div>
                  ) : (
                    <div className="admin-provider-table-wrap">
                      <table className="admin-provider-table">
                        <thead>
                          <tr>
                            <th>Priority</th>
                            <th>Display name</th>
                            <th>Provider / Model</th>
                            <th>Credential</th>
                            <th>Status</th>
                            <th>Updated</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((cfg, idx) => {
                            const linkedCred = (credentialsQuery.data?.credentials ?? []).find((c) => c.id === cfg.credentialId);
                            return (
                              <tr key={cfg.id} className={cfg.isActive ? "is-active" : ""}>
                                <td>
                                  <span className="priority-badge">{cfg.priority}</span>
                                  {cfg.isActive && <span className="active-dot" title="Active">● Active</span>}
                                </td>
                                <td>
                                  <strong>{cfg.displayName}</strong>
                                  <small className="mono">{shortId(cfg.id)}</small>
                                </td>
                                <td>
                                  <strong>{cfg.provider}</strong> / <code>{cfg.model}</code>
                                </td>
                                <td>
                                  {cfg.provider === "cloudflare_workers_ai" ? (
                                    <small>Workers AI binding</small>
                                  ) : linkedCred ? (
                                    <span><KeyRound size={12} /> {linkedCred.name} ••••{linkedCred.apiKeyLast4}</span>
                                  ) : (
                                    <span className="provider-status disabled">Missing</span>
                                  )}
                                </td>
                                <td>
                                  <span className={`provider-status ${cfg.enabled ? "enabled" : "disabled"}`}>
                                    {cfg.enabled ? "Enabled" : "Disabled"}
                                  </span>
                                </td>
                                <td>
                                  <span>{formatDate(cfg.updatedAt)}</span>
                                  <small>{cfg.updatedBy ? `by ${shortId(cfg.updatedBy)}` : "system"}</small>
                                </td>
                                <td>
                                  <div className="provider-actions">
                                    <button
                                      type="button"
                                      className="button small"
                                      disabled={cfg.isActive || activateMutation.isPending}
                                      onClick={() => setConfirmActivate(cfg)}
                                    >
                                      Activate
                                    </button>
                                    <label className="toggle">
                                      <input
                                        type="checkbox"
                                        checked={cfg.enabled}
                                        disabled={cfg.isActive}
                                        onChange={(e) =>
                                          toggleMutation.mutate({ id: cfg.id, enabled: e.target.checked })
                                        }
                                      />
                                      <span>Enabled</span>
                                    </label>
                                    <div className="reorder">
                                      <button
                                        type="button"
                                        aria-label="Move up"
                                        disabled={idx === 0 || reorderMutation.isPending}
                                        onClick={() => move(svc.id, list, idx, -1)}
                                      >
                                        <ArrowUp size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Move down"
                                        disabled={idx === list.length - 1 || reorderMutation.isPending}
                                        onClick={() => move(svc.id, list, idx, 1)}
                                      >
                                        <ArrowDown size={14} />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}

            <section className="admin-provider-section">
              <div className="admin-provider-section-heading">
                <h2>Recent changes</h2>
                <p>Audit trail: what changed, when, and by which admin. Secrets are never recorded.</p>
              </div>
              {auditsQuery.isPending ? (
                <div className="admin-provider-state">Loading audits…</div>
              ) : auditsQuery.data?.audits.length === 0 ? (
                <div className="admin-provider-empty">No changes recorded yet.</div>
              ) : (
                <ul className="admin-provider-audits">
                  {(auditsQuery.data?.audits ?? []).slice(0, 20).map((a) => (
                    <li key={a.id}>
                      <span className="audit-action">{a.action}</span>
                      <span className="audit-service">{a.service}</span>
                      <span className="audit-time">{formatDate(a.createdAt)}</span>
                      <span className="audit-by">by {shortId(a.changedBy)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {confirmActivate && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm">
                  <h3>Confirm activation</h3>
                  <p>
                    Switch active <strong>{confirmActivate.service}</strong> to{" "}
                    <strong>
                      {confirmActivate.displayName} ({confirmActivate.provider} / {confirmActivate.model})
                    </strong>
                    ? This affects production traffic immediately (cache invalidated) with ~30s TTL as fallback.
                  </p>
                  <div className="confirm-actions">
                    <button type="button" className="button secondary" onClick={() => setConfirmActivate(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate(confirmActivate.id)}
                    >
                      {activateMutation.isPending ? "Activating…" : "Activate"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {addFor && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm add-dialog">
                  <h3>Add {addFor} configuration</h3>
                  {(() => {
                    const existing = configsByService.get(addFor) ?? [];
                    const providers = availableProviders(addFor);
                    const models = addProvider ? remainingModels(addFor, addProvider, existing) : [];
                    const hasRemaining = providers.some((p) => remainingModels(addFor, p, existing).length > 0);
                    if (!hasRemaining) {
                      return (
                        <>
                          <p>
                            All allowlisted models for <strong>{addFor}</strong> are already configured. Expand{" "}
                            <code>providerAllowlist</code> in <code>packages/shared/src/types.ts</code> to add more
                            providers/models, then redeploy.
                          </p>
                          <div className="confirm-actions">
                            <button type="button" className="button secondary" onClick={() => setAddFor(null)}>
                              Close
                            </button>
                          </div>
                        </>
                      );
                    }
                    const credsForProvider = credentialsByProvider.get(addProvider) ?? [];
                    // google via Cloud Run bridge uses ADC — no credential required at runtime
                    const needsCred = addProvider !== "cloudflare_workers_ai" && addProvider !== "google";
                    return (
                      <>
                        <p>
                          Choose a provider and model. Give it a display name. Link a credential of matching provider. Duplicates are rejected.
                        </p>
                        <label className="add-field">
                          <span>Provider</span>
                          <select
                            value={addProvider}
                            onChange={(e) => {
                              const p = e.target.value;
                              setAddProvider(p);
                              const rem = remainingModels(addFor, p, existing);
                              setAddModel(rem[0] ?? "");
                              const creds = credentialsByProvider.get(p) ?? [];
                              setAddCredentialId(creds[0]?.id ?? "");
                              setAddDisplayName(p && rem[0] ? `${p} / ${rem[0]}` : "");
                            }}
                          >
                            {providers.map((p) => {
                              const rem = remainingModels(addFor, p, existing);
                              return (
                                <option key={p} value={p} disabled={rem.length === 0}>
                                  {p} {rem.length === 0 ? "(all models configured)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="add-field">
                          <span>Model</span>
                          <select value={addModel} onChange={(e) => setAddModel(e.target.value)}>
                            {models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          {models.length === 0 && <small>No remaining models for this provider.</small>}
                        </label>
                        <label className="add-field">
                          <span>Display name</span>
                          <input value={addDisplayName} onChange={(e) => setAddDisplayName(e.target.value)} placeholder="e.g. Google Chirp 3" maxLength={40} />
                        </label>
                        {needsCred ? (
                          <label className="add-field">
                            <span>Credential (must match provider)</span>
                            {credsForProvider.length === 0 ? (
                              <small>No credentials for {addProvider}. Create a credential first.</small>
                            ) : (
                              <select value={addCredentialId} onChange={(e) => setAddCredentialId(e.target.value)}>
                                {credsForProvider.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ••••{c.apiKeyLast4}
                                  </option>
                                ))}
                              </select>
                            )}
                          </label>
                        ) : addProvider === "google" ? (
                          <small>Google Chirp 3 uses Cloud Run bridge ADC — no credential required. Set STT_BRIDGE_URL in Worker vars.</small>
                        ) : (
                          <small>No credential required for Workers AI binding.</small>
                        )}
                        <div className="confirm-actions">
                          <button type="button" className="button secondary" onClick={() => setAddFor(null)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={!addProvider || !addModel || !addDisplayName.trim() || (needsCred && !addCredentialId) || createMutation.isPending}
                            onClick={() => createMutation.mutate({ service: addFor, provider: addProvider, model: addModel, displayName: addDisplayName.trim(), credentialId: needsCred ? addCredentialId : null })}
                          >
                            {createMutation.isPending ? "Adding…" : "Add configuration"}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {showAddCred && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm add-dialog">
                  <h3>Add credential</h3>
                  <p>Provider + human name + secret. Secret is encrypted (AES-256-GCM) and only ••••last4 is ever shown.</p>
                  <label className="add-field">
                    <span>Provider</span>
                    <select value={credProvider} onChange={(e) => setCredProvider(e.target.value)}>
                      <option value="deepseek">deepseek</option>
                      <option value="google">google</option>
                      <option value="fish_audio">fish_audio</option>
                    </select>
                  </label>
                  <label className="add-field">
                    <span>Name</span>
                    <input value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="e.g. Google STT Production" maxLength={40} />
                  </label>
                  <label className="add-field">
                    <span>Secret</span>
                    <input type="password" value={credSecret} onChange={(e) => setCredSecret(e.target.value)} placeholder="Paste secret (never shown again)" />
                    <small>For Google Speech-to-Text V2, paste service-account JSON or OAuth token as opaque secret; project info is derived at test time.</small>
                  </label>
                  <div className="confirm-actions">
                    <button type="button" className="button secondary" onClick={() => { setShowAddCred(false); setCredName(""); setCredSecret(""); }}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={!credProvider || credName.trim().length < 2 || credSecret.trim().length < 8 || createCredMutation.isPending}
                      onClick={() => createCredMutation.mutate({ provider: credProvider, name: credName.trim(), secret: credSecret })}
                    >
                      {createCredMutation.isPending ? "Creating…" : "Create credential"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editCred && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm add-dialog">
                  <h3>Edit credential — {editCred.provider} / {editCred.name}</h3>
                  <p>Current: ••••{editCred.apiKeyLast4} — {editCred.usedBy.length} configuration(s) using this credential.</p>
                  <label className="add-field">
                    <span>Name</span>
                    <input value={editCredName} onChange={(e) => setEditCredName(e.target.value)} maxLength={40} />
                  </label>
                  <label className="add-field">
                    <span>Rotate secret (leave blank to keep)</span>
                    <input type="password" value={editCredSecret} onChange={(e) => setEditCredSecret(e.target.value)} placeholder="Paste new secret to rotate" />
                  </label>
                  <div className="confirm-actions">
                    <button type="button" className="button secondary" onClick={() => { setEditCred(null); setEditCredName(""); setEditCredSecret(""); }}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={updateCredMutation.isPending || (editCredName.trim() === editCred.name && !editCredSecret.trim())}
                      onClick={() => updateCredMutation.mutate({ id: editCred.id, name: editCredName.trim() !== editCred.name ? editCredName.trim() : undefined, secret: editCredSecret.trim() || undefined })}
                    >
                      {updateCredMutation.isPending ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {deleteCred && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm">
                  <h3>Delete credential</h3>
                  <p>
                    Delete <strong>{deleteCred.provider} / {deleteCred.name} ••••{deleteCred.apiKeyLast4}</strong>?
                  </p>
                  {deleteCred.usedBy.length > 0 ? (
                    <p style={{ color: "#a00" }}>
                      Blocked — still used by {deleteCred.usedBy.length} configuration(s):
                      {deleteCred.usedBy.map((u) => ` ${u.displayName} (${u.provider}/${u.model})`).join(", ")}. Unlink first.
                    </p>
                  ) : (
                    <p>This cannot be undone.</p>
                  )}
                  <div className="confirm-actions">
                    <button type="button" className="button secondary" onClick={() => setDeleteCred(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={deleteCred.usedBy.length > 0 || deleteCredMutation.isPending}
                      onClick={() => deleteCredMutation.mutate(deleteCred.id)}
                    >
                      {deleteCredMutation.isPending ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
