import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Plus,
  KeyRound,
  Copy,
  Check,
  Cpu,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  activateProviderConfig,
  createProviderConfig,
  getProviderConfigAudits,
  getProviderConfigs,
  getProviderHealth,
  reorderProviderConfigs,
  updateProviderConfig,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import { providerAllowlist } from "@zoption/shared";
import type { ProviderConfig, ProviderService } from "@zoption/shared";
import "./AdminProviderConfigsPage.css";

const SERVICES: { id: ProviderService; label: string; description: string }[] = [
  { id: "assistant", label: "AI Assistant", description: "Primary conversational assistant model used for all Zoption AI answers." },
  { id: "stt", label: "Voice Input · STT", description: "Speech-to-text model for voice recordings." },
  { id: "tts", label: "Voice Output · TTS", description: "Text-to-speech model for spoken replies and previews." },
];

const SERVICE_CREDENTIALS: Record<ProviderService, { label: string; secretName: string | null; expectsKey: boolean }> = {
  assistant: { label: "DEEPSEEK_API_KEY", secretName: "DEEPSEEK_API_KEY", expectsKey: true },
  stt: { label: "Workers AI binding", secretName: null, expectsKey: false },
  tts: { label: "FISH_AUDIO_API_KEY", secretName: "FISH_AUDIO_API_KEY", expectsKey: true },
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
  const [apiKeyFor, setApiKeyFor] = useState<ProviderService | null>(null);
  const [addProvider, setAddProvider] = useState<string>("");
  const [addModel, setAddModel] = useState<string>("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const configsQuery = useQuery({
    queryKey: queryKeys.providerConfigs(workspace),
    queryFn: () => getProviderConfigs(workspace),
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
      setFeedback(`Activated ${updated.service} → ${updated.provider} / ${updated.model}`);
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
    mutationFn: (input: { service: ProviderService; provider: string; model: string }) =>
      createProviderConfig(workspace, input),
    onSuccess: (created) => {
      setFeedback(`Added ${created.service} → ${created.provider} / ${created.model}`);
      setErrorMsg(undefined);
      setAddFor(null);
      setAddProvider("");
      setAddModel("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Create failed."),
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

  const healthByService = useMemo(() => {
    const map = new Map<ProviderService, { hasCredential: boolean; details: string }>();
    for (const h of healthQuery.data?.health ?? []) map.set(h.service, h);
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

  // When add dialog opens, default provider to first available for that service
  function openAdd(service: ProviderService) {
    const providers = availableProviders(service);
    const firstProvider = providers[0] ?? "";
    const existing = configsByService.get(service) ?? [];
    const models = firstProvider ? remainingModels(service, firstProvider, existing) : [];
    // If first provider has no remaining models, try next provider
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
    setAddFor(service);
    setErrorMsg(undefined);
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("idle");
    }
  }

  return (
    <AppShell>
      <div className="admin-provider-page">
        <header className="admin-provider-header">
          <div>
            <p>Platform Administration</p>
            <h1>AI & Voice Models</h1>
            <span>
              Change the active provider/model for the assistant, speech-to-text, and text-to-speech without
              redeploying. Active changes affect subsequent requests within ~30 seconds. API keys remain in
              Cloudflare secrets and are never shown here. Manual activation only — no automatic fallback in this
              release.
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
                      Active: {active ? `${active.provider} / ${active.model}` : "none"}
                      {health ? (
                        <small
                          className={`health-badge ${health.hasCredential ? "ok" : "missing"}`}
                          title={health.details}
                        >
                          {cred.expectsKey
                            ? health.hasCredential
                              ? "● Key configured"
                              : "○ Key missing"
                            : health.hasCredential
                              ? "● Binding ready"
                              : "○ Binding missing"}
                        </small>
                      ) : null}
                    </span>
                  </div>

                  <div className="admin-provider-section-actions">
                    <button type="button" className="button secondary compact" onClick={() => openAdd(svc.id)}>
                      <Plus size={14} /> Add configuration
                    </button>
                    {cred.expectsKey ? (
                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={() => setApiKeyFor(svc.id)}
                      >
                        <KeyRound size={14} /> {health?.hasCredential ? "Manage API key" : "Add API key"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={() => setApiKeyFor(svc.id)}
                        title={health?.details}
                      >
                        <Cpu size={14} /> Binding info
                      </button>
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
                            <th>Provider</th>
                            <th>Model</th>
                            <th>Status</th>
                            <th>Updated</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((cfg, idx) => (
                            <tr key={cfg.id} className={cfg.isActive ? "is-active" : ""}>
                              <td>
                                <span className="priority-badge">{cfg.priority}</span>
                                {cfg.isActive && <span className="active-dot" title="Active">● Active</span>}
                              </td>
                              <td>
                                <strong>{cfg.provider}</strong>
                                <small className="mono">{shortId(cfg.id)}</small>
                              </td>
                              <td>
                                <code>{cfg.model}</code>
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
                          ))}
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
                      {confirmActivate.provider} / {confirmActivate.model}
                    </strong>
                    ? This affects production traffic within ~30 seconds.
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
                    return (
                      <>
                        <p>
                          Choose a provider and model. Duplicates are rejected. Priority is assigned automatically;
                          reorder after creation.
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
                        <div className="confirm-actions">
                          <button type="button" className="button secondary" onClick={() => setAddFor(null)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={!addProvider || !addModel || createMutation.isPending}
                            onClick={() => createMutation.mutate({ service: addFor, provider: addProvider, model: addModel })}
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

            {apiKeyFor && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm api-key-dialog">
                  {(() => {
                    const cred = SERVICE_CREDENTIALS[apiKeyFor];
                    const health = healthByService.get(apiKeyFor);
                    if (!cred.expectsKey) {
                      return (
                        <>
                          <h3>{apiKeyFor} — binding</h3>
                          <p>
                            STT uses <strong>Cloudflare Workers AI</strong> binding <code>AI</code> (
                            <code>wrangler.jsonc</code> <code>ai.binding = &quot;AI&quot;</code>). No API key is required.
                          </p>
                          <p className="mono small">Health: {health?.details ?? "Binding available on preview/production"}</p>
                          <div className="confirm-actions">
                            <button type="button" className="button secondary" onClick={() => setApiKeyFor(null)}>
                              Close
                            </button>
                          </div>
                        </>
                      );
                    }
                    const envName = cred.secretName!;
                    const previewCmd = `pnpm --filter @zoption/api exec wrangler secret put ${envName} --config wrangler.deploy.jsonc --env preview`;
                    const prodCmd = `pnpm --filter @zoption/api exec wrangler secret put ${envName} --config wrangler.deploy.jsonc --env production`;
                    return (
                      <>
                        <h3>{apiKeyFor} — {envName}</h3>
                        <p>
                          {health?.hasCredential ? "A secret is configured (value never shown)." : "No secret is configured for this provider."}{" "}
                          Secrets live in <strong>Cloudflare secrets</strong>, never in D1. Adding a configuration without a key
                          will return <code>configuration/missing_api_key</code> until the secret is set.
                        </p>
                        <p className="mono small">Health: {health?.details}</p>
                        <div className="api-key-commands">
                          <div>
                            <span>Preview</span>
                            <code>{previewCmd}</code>
                            <button type="button" className="icon-button" onClick={() => void handleCopy(previewCmd)} aria-label="Copy preview command">
                              {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                          <div>
                            <span>Production</span>
                            <code>{prodCmd}</code>
                            <button type="button" className="icon-button" onClick={() => void handleCopy(prodCmd)} aria-label="Copy production command">
                              {copyState === "copied" ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                        <p>
                          <small>
                            After putting the secret, redeploy is not required — the Worker reads it on next request. Test with a
                            new assistant/voice request.
                          </small>
                        </p>
                        <div className="confirm-actions">
                          <button type="button" className="button secondary" onClick={() => setApiKeyFor(null)}>
                            Close
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
