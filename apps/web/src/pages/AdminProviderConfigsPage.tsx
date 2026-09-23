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
  Zap,
  Check,
  Info,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { AdminProviderDialog, errorMessage } from "../components/admin/AdminProviderDialog";
import { AddConfigDialog, EditConfigDialog } from "../components/admin/ProviderConfigDialogs";
import {
  AddCredentialDialog,
  EditCredentialDialog,
} from "../components/admin/ProviderCredentialDialogs";
import { AppShell } from "../components/layout/AppShell";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { useBillingSummary } from "../hooks/useBillingSummary";
import {
  activateProviderConfig,
  deleteProviderConfig,
  deleteProviderCredential,
  getProviderConfigAudits,
  getProviderConfigs,
  getProviderCredentials,
  getProviderHealth,
  reorderProviderConfigs,
  testProviderCredential,
  updateProviderConfig,
} from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { userWorkspace } from "../lib/workspace";
import type { ProviderConfig, ProviderCredentialWithUsage, ProviderService } from "@zoption/shared";
import "./AdminProviderConfigsPage.css";

const SERVICES: { id: ProviderService; label: string; description: string }[] = [
  {
    id: "assistant",
    label: "AI Assistant",
    description:
      "Primary conversational assistant model used for all Zoption AI answers. Add a credential for DeepSeek, OpenAI, Anthropic, Gemini, Meta, or Muse Spark, then activate that configuration to test a new model.",
  },
  {
    id: "stt",
    label: "Voice Input · STT",
    description: "Speech-to-text model for voice recordings.",
  },
  {
    id: "tts",
    label: "Voice Output · TTS",
    description: "Text-to-speech model for spoken replies and previews.",
  },
];

const SERVICE_CREDENTIALS: Record<ProviderService, { label: string; expectsKey: boolean }> = {
  assistant: {
    label: "AI model (DeepSeek, OpenAI, Anthropic, Gemini, Meta, Muse Spark)",
    expectsKey: true,
  },
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
  const [selectedTab, setSelectedTab] = useState<
    "all" | "stt" | "assistant" | "tts" | "credentials"
  >("all");
  const [confirmActivate, setConfirmActivate] = useState<ProviderConfig | null>(null);
  const [deleteConfig, setDeleteConfig] = useState<ProviderConfig | null>(null);
  const [addFor, setAddFor] = useState<ProviderService | null>(null);
  const [editConfig, setEditConfig] = useState<ProviderConfig | null>(null);
  const [showAddCred, setShowAddCred] = useState(false);
  const [editCred, setEditCred] = useState<ProviderCredentialWithUsage | null>(null);
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
    queryKey: queryKeys.providerHealth(workspace),
    queryFn: () => getProviderHealth(workspace),
    enabled: isAdmin,
    refetchInterval: 20_000,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => activateProviderConfig(workspace, id),
    onSuccess: (updated) => {
      setFeedback(
        `Activated ${updated.service} → ${updated.displayName ?? `${updated.provider} / ${updated.model}`}`,
      );
      setErrorMsg(undefined);
      setConfirmActivate(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providerHealth(workspace),
      });
    },
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Activation failed.")),
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
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Update failed.")),
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
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Reorder failed.")),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => deleteProviderConfig(workspace, id),
    onSuccess: (deleted) => {
      setFeedback(`Deleted configuration: ${deleted.displayName}`);
      setErrorMsg(undefined);
      setDeleteConfig(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providerHealth(workspace),
      });
    },
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Delete configuration failed.")),
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => deleteProviderCredential(workspace, id),
    onSuccess: () => {
      setFeedback("Credential deleted.");
      setErrorMsg(undefined);
      setDeleteCred(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
    },
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Delete credential failed.")),
  });

  const testCredMutation = useMutation({
    mutationFn: (id: string) => testProviderCredential(workspace, id),
    onSuccess: (res) => {
      setFeedback(`Credential test ok: ${res.provider} ••••${res.last4}`);
      setErrorMsg(undefined);
    },
    onError: (err: unknown) => setErrorMsg(errorMessage(err, "Credential test failed.")),
  });

  function move(
    service: ProviderService,
    configs: ProviderConfig[],
    fromIndex: number,
    direction: -1 | 1,
  ) {
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
    const map = new Map<
      ProviderService,
      { hasCredential: boolean; details: string; apiKeyLast4?: string | null; source?: string }
    >();
    for (const h of healthQuery.data?.health ?? []) map.set(h.service, h);
    return map;
  }, [healthQuery.data?.health]);

  function openAdd(service: ProviderService) {
    setErrorMsg(undefined);
    setAddFor(service);
  }

  function saved(message: string) {
    setFeedback(message);
    setErrorMsg(undefined);
    setAddFor(null);
    setEditConfig(null);
    setShowAddCred(false);
    setEditCred(null);
  }

  return (
    <AppShell>
      <div className="admin-provider-page">
        {isAdmin && (
          <Breadcrumbs
            items={[
              { label: "Home", to: "/app" },
              { label: "Admin console", to: "/app/admin" },
              { label: "AI & Voice Models" },
            ]}
          />
        )}
        <header className="admin-provider-header">
          <div>
            <p>Platform Administration</p>
            <h1>AI & Voice Models</h1>
            <span>
              Manage reusable credentials and provider configurations. Credentials are encrypted
              with AES-256-GCM and never shown in full. Configurations reuse credentials by
              provider. Active changes affect all users immediately (registry cache invalidated)
              with ~30s TTL as fallback. Manual switching only — no automatic fallback.
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
          <div className="admin-provider-state">
            Administrator access could not be checked. Try again.
          </div>
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
              <AlertTriangle size={16} /> Fallback order is displayed for operational visibility
              only. This release does not auto-retry across providers — switch the active model
              manually if a provider has an outage.
            </div>

            {/* Navigation Tabs */}
            <nav
              className="admin-provider-tabs-bar"
              role="tablist"
              aria-label="Provider configuration sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "all"}
                className={`admin-provider-tab ${selectedTab === "all" ? "active" : ""}`}
                onClick={() => setSelectedTab("all")}
              >
                All Services
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "stt"}
                className={`admin-provider-tab ${selectedTab === "stt" ? "active" : ""}`}
                onClick={() => setSelectedTab("stt")}
              >
                <span>STT (Speech-to-Text)</span>
                {(() => {
                  const act = (configsByService.get("stt") ?? []).find((c) => c.isActive);
                  return act ? <span className="tab-pill">{act.provider}</span> : null;
                })()}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "assistant"}
                className={`admin-provider-tab ${selectedTab === "assistant" ? "active" : ""}`}
                onClick={() => setSelectedTab("assistant")}
              >
                <span>Assistant (LLM)</span>
                {(() => {
                  const act = (configsByService.get("assistant") ?? []).find((c) => c.isActive);
                  return act ? <span className="tab-pill">{act.provider}</span> : null;
                })()}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "tts"}
                className={`admin-provider-tab ${selectedTab === "tts" ? "active" : ""}`}
                onClick={() => setSelectedTab("tts")}
              >
                <span>TTS (Text-to-Speech)</span>
                {(() => {
                  const act = (configsByService.get("tts") ?? []).find((c) => c.isActive);
                  return act ? <span className="tab-pill">{act.provider}</span> : null;
                })()}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === "credentials"}
                className={`admin-provider-tab ${selectedTab === "credentials" ? "active" : ""}`}
                onClick={() => setSelectedTab("credentials")}
              >
                <span>Credentials & Secrets</span>
                <span className="tab-count">{credentialsQuery.data?.credentials.length ?? 0}</span>
              </button>
            </nav>

            {/* Credentials section */}
            {(selectedTab === "all" || selectedTab === "credentials") && (
              <section className="admin-provider-section">
                <div className="admin-provider-section-heading">
                  <div>
                    <h2>Credentials</h2>
                    <p>
                      Reusable encrypted secrets. Name + ••••last4 shown only. One credential can be
                      reused by multiple configurations of the same provider.
                    </p>
                  </div>
                  <span>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setShowAddCred(true)}
                    >
                      <Plus size={14} /> Add credential
                    </button>
                  </span>
                </div>
                {credentialsQuery.isPending ? (
                  <div className="admin-provider-state">Loading credentials…</div>
                ) : (credentialsQuery.data?.credentials.length ?? 0) === 0 ? (
                  <div className="admin-provider-empty">
                    No credentials yet. Add a credential to create provider configurations that
                    require secrets.
                  </div>
                ) : (
                  <div className="admin-provider-table-wrap">
                    <table className="admin-provider-table">
                      <caption className="sr-only">
                        Saved provider credentials with the provider, name, masked secret, how many
                        configurations use them, and when they were last updated
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Provider</th>
                          <th scope="col">Name</th>
                          <th scope="col">Secret</th>
                          <th scope="col">Used by</th>
                          <th scope="col">Updated</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(credentialsQuery.data?.credentials ?? []).map((cred) => (
                          <tr key={cred.id}>
                            <td>
                              <strong>{cred.provider}</strong>
                              <small className="mono">{shortId(cred.id)}</small>
                            </td>
                            <td>{cred.name}</td>
                            <td>
                              <code>••••{cred.apiKeyLast4}</code>
                            </td>
                            <td>
                              {cred.usedBy.length === 0 ? (
                                <small>unused</small>
                              ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {cred.usedBy.map((u) => (
                                    <span
                                      key={u.configId}
                                      className={`provider-status ${u.isActive ? "enabled" : "disabled"}`}
                                      title={`${u.service} • ${u.displayName} • ${u.provider}/${u.model}`}
                                    >
                                      {u.displayName} {u.isActive ? "●" : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>
                              <span>{formatDate(cred.updatedAt)}</span>
                            </td>
                            <td>
                              <div className="provider-actions">
                                <button
                                  type="button"
                                  className="button small secondary"
                                  onClick={() => testCredMutation.mutate(cred.id)}
                                  disabled={testCredMutation.isPending}
                                  title="Test credential (decrypt + cheap provider check)"
                                >
                                  <TestTube size={12} /> Test
                                </button>
                                <button
                                  type="button"
                                  className="button small secondary"
                                  onClick={() => setEditCred(cred)}
                                >
                                  <Pencil size={12} /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="button small secondary"
                                  onClick={() => setDeleteCred(cred)}
                                >
                                  <Trash2 size={12} /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {SERVICES.filter((svc) => selectedTab === "all" || selectedTab === svc.id).map(
              (svc) => {
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
                    </div>

                    {/* Prominent Active Provider Card */}
                    <div className="admin-active-hero-card">
                      <div className="admin-active-hero-badge-row">
                        <span className="active-glow-pill">
                          <span className="active-dot-pulsing" /> Currently Active
                        </span>
                        {svc.id === "stt" && (
                          <span
                            className={`streaming-capability-pill ${
                              active?.provider === "google" ? "supported" : "unsupported"
                            }`}
                          >
                            {active?.provider === "google" ? (
                              <>
                                <Zap size={12} /> Realtime Live Streaming Active
                              </>
                            ) : (
                              <>
                                <AlertTriangle size={12} /> Batch Only (Live Stream Disabled)
                              </>
                            )}
                          </span>
                        )}
                        {health && (
                          <span
                            className={`health-badge ${health.hasCredential ? "ok" : "missing"}`}
                          >
                            {svc.id === "stt" && active?.provider === "cloudflare_workers_ai"
                              ? health.hasCredential
                                ? "● Workers AI binding ready"
                                : "○ Binding missing"
                              : health.hasCredential
                                ? `● Key ••••${health.apiKeyLast4 ?? ""}`
                                : "○ Credential missing"}
                          </span>
                        )}
                      </div>

                      <div className="admin-active-hero-content">
                        <div className="admin-active-hero-info">
                          <h3 className="admin-active-hero-title">
                            Active: {active ? active.displayName : "No configuration active"}
                          </h3>
                          <div className="admin-active-hero-meta">
                            Provider: <strong>{active ? active.provider : "—"}</strong>
                            <span className="meta-sep">·</span>
                            Model: <code>{active ? active.model : "—"}</code>
                          </div>
                        </div>

                        <div className="admin-active-hero-actions">
                          {svc.id === "stt" &&
                            active?.provider === "cloudflare_workers_ai" &&
                            (() => {
                              const googleConfig = list.find(
                                (c) => c.provider === "google" && !c.isActive,
                              );
                              if (googleConfig) {
                                return (
                                  <button
                                    type="button"
                                    className="button compact switch-to-live-btn"
                                    onClick={() => setConfirmActivate(googleConfig)}
                                    title="Switch to Google Gemini Live for instant voice streaming"
                                  >
                                    <Zap size={13} /> Switch to Gemini Live
                                  </button>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  className="button compact switch-to-live-btn"
                                  onClick={() => openAdd("stt")}
                                >
                                  <Plus size={13} /> Add Google Live Key
                                </button>
                              );
                            })()}
                        </div>
                      </div>

                      {svc.id === "stt" && active?.provider === "cloudflare_workers_ai" && (
                        <div className="admin-active-hero-callout">
                          <Info size={14} />
                          <span>
                            <strong>Cloudflare Whisper is currently active.</strong> It only
                            transcribes audio after you finish speaking and tap stop. To see words
                            transcribed live in real time as you speak, switch to{" "}
                            <strong>Google Gemini Live</strong> below.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="admin-provider-section-actions">
                      <button
                        type="button"
                        className="button secondary compact"
                        onClick={() => openAdd(svc.id)}
                      >
                        <Plus size={14} /> Add configuration
                      </button>
                      {svc.id === "stt" ? (
                        <span style={{ fontSize: 12, opacity: 0.7 }}>
                          Cloudflare uses Workers AI edge binding; Google uses API key credential or
                          Cloud Run bridge.
                        </span>
                      ) : cred.expectsKey ? (
                        <span style={{ fontSize: 12, opacity: 0.7 }}>
                          Configurations require a {svc.label} credential of matching provider.
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.7 }}>
                          <Cpu size={14} /> Binding info
                        </span>
                      )}
                    </div>

                    {list.length === 0 ? (
                      <div className="admin-provider-empty">
                        No configurations for this service.
                      </div>
                    ) : (
                      <div className="admin-provider-table-wrap">
                        <table className="admin-provider-table">
                          <caption className="sr-only">
                            {svc.label} provider configurations in priority order, with provider and
                            model, linked credential, activation status, and last update
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Priority</th>
                              <th scope="col">Display name</th>
                              <th scope="col">Provider / Model</th>
                              <th scope="col">Credential</th>
                              <th scope="col">Status</th>
                              <th scope="col">Updated</th>
                              <th scope="col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((cfg, idx) => {
                              const linkedCred = (credentialsQuery.data?.credentials ?? []).find(
                                (c) => c.id === cfg.credentialId,
                              );
                              return (
                                <tr key={cfg.id} className={cfg.isActive ? "is-active" : ""}>
                                  <td>
                                    <span className="priority-badge">{cfg.priority}</span>
                                    {cfg.isActive && (
                                      <span className="active-dot" title="Active">
                                        ● Active
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <strong>{cfg.displayName}</strong>
                                    <small className="mono">{shortId(cfg.id)}</small>
                                  </td>
                                  <td>
                                    <div>
                                      <strong>{cfg.provider}</strong> / <code>{cfg.model}</code>
                                    </div>
                                    {svc.id === "stt" && (
                                      <div style={{ marginTop: 4 }}>
                                        {cfg.provider === "google" ? (
                                          <span className="table-cap-pill live">
                                            <Zap size={10} /> Realtime Live
                                          </span>
                                        ) : (
                                          <span className="table-cap-pill batch">Batch Only</span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    {cfg.provider === "cloudflare_workers_ai" ? (
                                      <small>Workers AI binding</small>
                                    ) : linkedCred ? (
                                      <span>
                                        <KeyRound size={12} /> {linkedCred.name} ••••
                                        {linkedCred.apiKeyLast4}
                                      </span>
                                    ) : cfg.provider === "google" ? (
                                      <small>Bridge ADC (no key linked)</small>
                                    ) : (
                                      <span className="provider-status disabled">Missing</span>
                                    )}
                                  </td>
                                  <td>
                                    <span
                                      className={`provider-status ${cfg.enabled ? "enabled" : "disabled"}`}
                                    >
                                      {cfg.enabled ? "Enabled" : "Disabled"}
                                    </span>
                                  </td>
                                  <td>
                                    <span>{formatDate(cfg.updatedAt)}</span>
                                    <small>
                                      {cfg.updatedBy ? `by ${shortId(cfg.updatedBy)}` : "system"}
                                    </small>
                                  </td>
                                  <td>
                                    <div className="provider-actions">
                                      {cfg.isActive ? (
                                        <span
                                          className="active-tag-chip"
                                          title="This model is currently active"
                                        >
                                          <Check size={12} /> Active
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="button small activate-row-btn"
                                          disabled={activateMutation.isPending}
                                          onClick={() => setConfirmActivate(cfg)}
                                          title="Make this the active model"
                                        >
                                          <Zap size={12} /> Activate
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="button small secondary"
                                        onClick={() => setEditConfig(cfg)}
                                        title="Edit display name, model, or linked credential"
                                      >
                                        <Pencil size={12} /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="button small secondary danger-btn"
                                        disabled={cfg.isActive || deleteConfigMutation.isPending}
                                        onClick={() => setDeleteConfig(cfg)}
                                        title={
                                          cfg.isActive
                                            ? "Cannot delete active configuration. Activate another one first."
                                            : "Delete configuration"
                                        }
                                        aria-label={`Delete configuration ${cfg.displayName}`}
                                      >
                                        <Trash2 size={12} /> Delete
                                      </button>
                                      <label className="toggle">
                                        <input
                                          type="checkbox"
                                          checked={cfg.enabled}
                                          disabled={cfg.isActive}
                                          onChange={(e) =>
                                            toggleMutation.mutate({
                                              id: cfg.id,
                                              enabled: e.target.checked,
                                            })
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
                                          disabled={
                                            idx === list.length - 1 || reorderMutation.isPending
                                          }
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
              },
            )}

            <section className="admin-provider-section">
              <div className="admin-provider-section-heading">
                <h2>Recent changes</h2>
                <p>
                  Audit trail: what changed, when, and by which admin. Secrets are never recorded.
                </p>
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
              <AdminProviderDialog
                label="Confirm activation"
                onClose={() => setConfirmActivate(null)}
              >
                <div className="admin-provider-confirm">
                  <h3>Confirm activation</h3>
                  <p>
                    Switch active <strong>{confirmActivate.service}</strong> to{" "}
                    <strong>
                      {confirmActivate.displayName} ({confirmActivate.provider} /{" "}
                      {confirmActivate.model})
                    </strong>
                    ? This affects production traffic immediately (cache invalidated) with ~30s TTL
                    as fallback.
                  </p>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setConfirmActivate(null)}
                    >
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
              </AdminProviderDialog>
            )}

            {deleteConfig && (
              <AdminProviderDialog
                label="Delete configuration"
                onClose={() => setDeleteConfig(null)}
              >
                <div className="admin-provider-confirm">
                  <h3>Delete configuration</h3>
                  <p>
                    Are you sure you want to delete <strong>{deleteConfig.displayName}</strong> (
                    <code>
                      {deleteConfig.provider} / {deleteConfig.model}
                    </code>
                    )?
                  </p>
                  <p>
                    This configuration will be permanently removed. Any credentials linked to it
                    will remain intact.
                  </p>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setDeleteConfig(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={deleteConfigMutation.isPending}
                      onClick={() => deleteConfigMutation.mutate(deleteConfig.id)}
                    >
                      {deleteConfigMutation.isPending ? "Deleting…" : "Delete configuration"}
                    </button>
                  </div>
                </div>
              </AdminProviderDialog>
            )}

            {editConfig && (
              <EditConfigDialog
                workspace={workspace}
                config={editConfig}
                existing={configsByService.get(editConfig.service) ?? []}
                credentialsByProvider={credentialsByProvider}
                onClose={() => setEditConfig(null)}
                onSaved={saved}
              />
            )}

            {addFor && (
              <AddConfigDialog
                workspace={workspace}
                service={addFor}
                existing={configsByService.get(addFor) ?? []}
                credentialsByProvider={credentialsByProvider}
                onClose={() => setAddFor(null)}
                onSaved={saved}
              />
            )}

            {showAddCred && (
              <AddCredentialDialog
                workspace={workspace}
                onClose={() => setShowAddCred(false)}
                onSaved={saved}
              />
            )}

            {editCred && (
              <EditCredentialDialog
                workspace={workspace}
                credential={editCred}
                onClose={() => setEditCred(null)}
                onSaved={saved}
              />
            )}

            {deleteCred && (
              <AdminProviderDialog label="Delete credential" onClose={() => setDeleteCred(null)}>
                <div className="admin-provider-confirm">
                  <h3>Delete credential</h3>
                  <p>
                    Delete{" "}
                    <strong>
                      {deleteCred.provider} / {deleteCred.name} ••••{deleteCred.apiKeyLast4}
                    </strong>
                    ?
                  </p>
                  {deleteCred.usedBy.length > 0 ? (
                    <p style={{ color: "var(--danger)" }}>
                      Blocked — still used by {deleteCred.usedBy.length} configuration(s):
                      {deleteCred.usedBy
                        .map((u) => ` ${u.displayName} (${u.provider}/${u.model})`)
                        .join(", ")}
                      . Unlink first.
                    </p>
                  ) : (
                    <p>This cannot be undone.</p>
                  )}
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setDeleteCred(null)}
                    >
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
              </AdminProviderDialog>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
