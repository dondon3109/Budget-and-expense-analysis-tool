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
  Eye,
  EyeOff,
  CheckCircle2,
  Zap,
  Check,
  Info,
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
  deleteProviderConfig,
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
  {
    id: "assistant",
    label: "AI Assistant",
    description: "Primary conversational assistant model used for all Zoption AI answers.",
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
  const [selectedTab, setSelectedTab] = useState<"all" | "stt" | "assistant" | "tts" | "credentials">("all");
  const [confirmActivate, setConfirmActivate] = useState<ProviderConfig | null>(null);
  const [deleteConfig, setDeleteConfig] = useState<ProviderConfig | null>(null);

  // Configuration add dialog state
  const [addFor, setAddFor] = useState<ProviderService | null>(null);
  const [addProvider, setAddProvider] = useState<string>("");
  const [addModel, setAddModel] = useState<string>("");
  const [addDisplayName, setAddDisplayName] = useState<string>("");
  const [addCredentialId, setAddCredentialId] = useState<string>("");
  const [addCredMode, setAddCredMode] = useState<"existing" | "new" | "none">("new");
  const [addNewCredName, setAddNewCredName] = useState<string>("");
  const [addNewCredSecret, setAddNewCredSecret] = useState<string>("");
  const [showAddSecret, setShowAddSecret] = useState<boolean>(false);
  const [addActivateImmediately, setAddActivateImmediately] = useState<boolean>(true);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState<boolean>(false);
  // Errors from the add dialog must render inside it. The dialog is a
  // full-viewport scrim, so anything routed to the page-level errorMsg is
  // painted underneath and the save looks like a dead click.
  const [addError, setAddError] = useState<string>();

  // Credential dialog state
  const [showAddCred, setShowAddCred] = useState(false);
  const [credProvider, setCredProvider] = useState<string>("deepseek");
  const [credName, setCredName] = useState<string>("");
  const [credSecret, setCredSecret] = useState<string>("");
  const [showAddCredSecret, setShowAddCredSecret] = useState(false);
  const [editCred, setEditCred] = useState<ProviderCredentialWithUsage | null>(null);
  const [editCredName, setEditCredName] = useState<string>("");
  const [editCredSecret, setEditCredSecret] = useState<string>("");
  const [showEditCredSecret, setShowEditCredSecret] = useState(false);
  const [deleteCred, setDeleteCred] = useState<ProviderCredentialWithUsage | null>(null);

  // Configuration edit dialog state
  const [editConfig, setEditConfig] = useState<ProviderConfig | null>(null);
  const [editConfigDisplayName, setEditConfigDisplayName] = useState<string>("");
  const [editConfigCredentialId, setEditConfigCredentialId] = useState<string>("");
  const [editCredMode, setEditCredMode] = useState<"existing" | "new" | "none">("existing");
  const [editNewCredName, setEditNewCredName] = useState<string>("");
  const [editNewCredSecret, setEditNewCredSecret] = useState<string>("");
  const [showEditSecret, setShowEditSecret] = useState<boolean>(false);

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
      setFeedback(
        `Activated ${updated.service} → ${updated.displayName ?? `${updated.provider} / ${updated.model}`}`,
      );
      setErrorMsg(undefined);
      setConfirmActivate(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Activation failed."),
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
    mutationFn: (input: {
      service: ProviderService;
      provider: string;
      model: string;
      displayName: string;
      credentialId?: string | null;
    }) => createProviderConfig(workspace, input),
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
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    },
    onError: (err: unknown) => setErrorMsg(err instanceof Error ? err.message : "Create failed."),
  });

  const updateConfigMutation = useMutation({
    mutationFn: (input: { id: string; displayName?: string; credentialId?: string | null }) =>
      updateProviderConfig(workspace, input.id, {
        displayName: input.displayName,
        credentialId: input.credentialId,
      }),
    onSuccess: (updated) => {
      setFeedback(`Updated configuration: ${updated.displayName}`);
      setErrorMsg(undefined);
      setEditConfig(null);
      setEditConfigDisplayName("");
      setEditConfigCredentialId("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Update configuration failed."),
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
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Delete configuration failed."),
  });

  async function handleCreateConfig() {
    if (!addFor || !addProvider || !addModel || !addDisplayName.trim()) return;
    setIsSubmittingConfig(true);
    setAddError(undefined);
    setErrorMsg(undefined);
    try {
      let credentialId: string | null = null;
      const isCloudflare = addProvider === "cloudflare_workers_ai";
      const isGoogle = addProvider === "google";

      if (!isCloudflare) {
        if (addCredMode === "new") {
          if (!addNewCredSecret.trim()) {
            throw new Error("Please enter an API key or secret.");
          }
          const createdCred = await createProviderCredential(workspace, {
            provider: addProvider,
            name: addNewCredName.trim() || (isGoogle ? "Google AI Studio Key" : `${addProvider} Key`),
            secret: addNewCredSecret.trim(),
          });
          credentialId = createdCred.id;
          void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
        } else if (addCredMode === "existing") {
          if (!addCredentialId && !isGoogle) {
            throw new Error("Please select a saved credential or enter an API key.");
          }
          credentialId = addCredentialId || null;
        } else if (addCredMode === "none") {
          if (!isGoogle) {
            throw new Error("This provider requires an API key.");
          }
          credentialId = null;
        }
      }

      const created = await createProviderConfig(workspace, {
        service: addFor,
        provider: addProvider,
        model: addModel,
        displayName: addDisplayName.trim(),
        credentialId,
      });

      if (addActivateImmediately) {
        try {
          await activateProviderConfig(workspace, created.id);
          setFeedback(`Added and activated ${created.service} → ${created.displayName}`);
        } catch {
          setFeedback(`Added ${created.service} → ${created.displayName} (activation pending)`);
        }
      } else {
        setFeedback(`Added ${created.service} → ${created.displayName}`);
      }
      setAddFor(null);
      setAddProvider("");
      setAddModel("");
      setAddDisplayName("");
      setAddCredentialId("");
      setAddNewCredName("");
      setAddNewCredSecret("");
      setAddCredMode("new");
      setAddActivateImmediately(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create configuration.");
    } finally {
      setIsSubmittingConfig(false);
    }
  }

  async function handleUpdateConfig() {
    if (!editConfig || !editConfigDisplayName.trim()) return;
    setIsSubmittingConfig(true);
    setErrorMsg(undefined);
    try {
      let credentialId: string | null = editConfigCredentialId || null;
      const isCloudflare = editConfig.provider === "cloudflare_workers_ai";
      const isGoogle = editConfig.provider === "google";

      if (!isCloudflare) {
        if (editCredMode === "new") {
          if (!editNewCredSecret.trim()) {
            throw new Error("Please enter an API key or secret.");
          }
          const createdCred = await createProviderCredential(workspace, {
            provider: editConfig.provider,
            name: editNewCredName.trim() || `${editConfig.provider} Key`,
            secret: editNewCredSecret.trim(),
          });
          credentialId = createdCred.id;
          void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
        } else if (editCredMode === "existing") {
          if (!editConfigCredentialId && !isGoogle) {
            throw new Error("Please select a saved credential or enter an API key.");
          }
          credentialId = editConfigCredentialId || null;
        } else if (editCredMode === "none") {
          credentialId = null;
        }
      }

      const updated = await updateProviderConfig(workspace, editConfig.id, {
        displayName: editConfigDisplayName.trim(),
        credentialId,
      });

      setFeedback(`Updated configuration: ${updated.displayName}`);
      setEditConfig(null);
      setEditConfigDisplayName("");
      setEditConfigCredentialId("");
      setEditNewCredName("");
      setEditNewCredSecret("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update configuration.");
    } finally {
      setIsSubmittingConfig(false);
    }
  }

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
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Create credential failed."),
  });

  const updateCredMutation = useMutation({
    mutationFn: (input: { id: string; name?: string; secret?: string }) =>
      updateProviderCredential(workspace, input.id, {
        ...(input.name ? { name: input.name } : {}),
        ...(input.secret ? { secret: input.secret } : {}),
      }),
    onSuccess: (c) => {
      setFeedback(`Updated credential ${c.name} ••••${c.apiKeyLast4}`);
      setErrorMsg(undefined);
      setEditCred(null);
      setEditCredName("");
      setEditCredSecret("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.providerConfigs(workspace), "health"] as const,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Update credential failed."),
  });

  const deleteCredMutation = useMutation({
    mutationFn: (id: string) => deleteProviderCredential(workspace, id),
    onSuccess: () => {
      setFeedback("Credential deleted.");
      setErrorMsg(undefined);
      setDeleteCred(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Delete credential failed."),
  });

  const testCredMutation = useMutation({
    mutationFn: (id: string) => testProviderCredential(workspace, id),
    onSuccess: (res) => {
      setFeedback(`Credential test ok: ${res.provider} ••••${res.last4}`);
      setErrorMsg(undefined);
    },
    onError: (err: unknown) =>
      setErrorMsg(err instanceof Error ? err.message : "Credential test failed."),
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
    for (const h of healthQuery.data?.health ?? [])
      map.set(
        h.service,
        h as unknown as {
          hasCredential: boolean;
          details: string;
          apiKeyLast4?: string | null;
          source?: string;
        },
      );
    return map;
  }, [healthQuery.data?.health]);

  function availableProviders(service: ProviderService): string[] {
    return Object.keys(providerAllowlist[service] ?? {});
  }

  function availableModels(service: ProviderService, provider: string): string[] {
    const models = (providerAllowlist[service] as Record<string, readonly string[]> | undefined)?.[
      provider
    ] as readonly string[] | undefined;
    return models ? [...models] : [];
  }

  function remainingModels(
    service: ProviderService,
    provider: string,
    existing: ProviderConfig[],
  ): string[] {
    const all = availableModels(service, provider);
    const used = new Set(existing.filter((c) => c.provider === provider).map((c) => c.model));
    return all.filter((m) => !used.has(m));
  }

  function openAdd(service: ProviderService) {
    setAddActivateImmediately(true);
    const providers = availableProviders(service);
    const existing = configsByService.get(service) ?? [];

    // For STT, prefer "google" if it has remaining models because cloudflare is already configured by default
    let preferredProvider = providers[0] ?? "";
    if (service === "stt" && providers.includes("google")) {
      const googleRem = remainingModels(service, "google", existing);
      if (googleRem.length > 0) {
        preferredProvider = "google";
      }
    }

    const models = preferredProvider ? remainingModels(service, preferredProvider, existing) : [];
    let provider = preferredProvider;
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
    setAddDisplayName(
      provider === "google" && model.includes("live")
        ? "Google Gemini 3.5 Transcribe Live"
        : provider && model
          ? `${provider} / ${model}`
          : "",
    );
    const creds = credentialsByProvider.get(provider) ?? [];
    setAddCredentialId(creds[0]?.id ?? "");
    setAddCredMode(
      provider === "cloudflare_workers_ai"
        ? "none"
        : creds.length > 0
          ? "existing"
          : "new",
    );
    setAddNewCredName(
      provider === "google"
        ? "Google AI Studio Key"
        : provider === "deepseek"
          ? "DeepSeek Key"
          : `${provider} Key`,
    );
    setAddNewCredSecret("");
    setShowAddSecret(false);
    setAddFor(service);
    setAddError(undefined);
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
            <nav className="admin-provider-tabs-bar" role="tablist" aria-label="Provider configuration sections">
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
                <span className="tab-count">
                  {credentialsQuery.data?.credentials.length ?? 0}
                </span>
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
                                  onClick={() => {
                                    setEditCred(cred);
                                    setEditCredName(cred.name);
                                    setEditCredSecret("");
                                  }}
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

            {SERVICES.filter((svc) => selectedTab === "all" || selectedTab === svc.id).map((svc) => {
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
                        <span className={`health-badge ${health.hasCredential ? "ok" : "missing"}`}>
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
                        {svc.id === "stt" && active?.provider === "cloudflare_workers_ai" && (() => {
                          const googleConfig = list.find((c) => c.provider === "google" && !c.isActive);
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
                          <strong>Cloudflare Whisper is currently active.</strong> It only transcribes audio after you finish speaking and tap stop. To see words transcribed live in real time as you speak, switch to <strong>Google Gemini Live</strong> below.
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
                                        <span className="table-cap-pill batch">
                                          Batch Only
                                        </span>
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
                                      <span className="active-tag-chip" title="This model is currently active">
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
                                      onClick={() => {
                                        const creds = credentialsByProvider.get(cfg.provider) ?? [];
                                        setEditConfig(cfg);
                                        setEditConfigDisplayName(cfg.displayName);
                                        setEditConfigCredentialId(cfg.credentialId ?? "");
                                        setEditCredMode(
                                          cfg.credentialId
                                            ? "existing"
                                            : cfg.provider === "google"
                                              ? "none"
                                              : creds.length > 0
                                                ? "existing"
                                                : "new",
                                        );
                                        setEditNewCredName(
                                          cfg.provider === "google"
                                            ? "Google AI Studio Key"
                                            : `${cfg.provider} Key`,
                                        );
                                        setEditNewCredSecret("");
                                        setShowEditSecret(false);
                                      }}
                                      title="Edit display name or linked credential"
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
            })}

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
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
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
              </div>
            )}

            {deleteConfig && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
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
              </div>
            )}

            {editConfig && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm add-dialog">
                  <h3>Edit configuration — {editConfig.displayName}</h3>
                  <p>
                    Provider: <strong>{editConfig.provider}</strong> · Model:{" "}
                    <code>{editConfig.model}</code>
                  </p>
                  <label className="add-field">
                    <span>Display name</span>
                    <input
                      value={editConfigDisplayName}
                      onChange={(e) => setEditConfigDisplayName(e.target.value)}
                      maxLength={40}
                    />
                  </label>
                  {editConfig.provider === "cloudflare_workers_ai" ? (
                    <small>Workers AI binding is managed by Cloudflare configuration.</small>
                  ) : (
                    <div className="credential-box">
                      <div className="field-header-row">
                        <span className="field-label-text">Credential</span>
                      </div>
                      {(() => {
                        const creds = credentialsByProvider.get(editConfig.provider) ?? [];
                        const isGoogle = editConfig.provider === "google";
                        return (
                          <>
                            <div className="cred-mode-picker" role="tablist" aria-label="Credential mode">
                              <button
                                type="button"
                                className={`cred-mode-btn ${editCredMode === "existing" ? "active" : ""}`}
                                onClick={() => setEditCredMode("existing")}
                                disabled={creds.length === 0 && !isGoogle}
                              >
                                Saved key {creds.length > 0 ? `(${creds.length})` : ""}
                              </button>
                              <button
                                type="button"
                                className={`cred-mode-btn ${editCredMode === "new" ? "active" : ""}`}
                                onClick={() => setEditCredMode("new")}
                              >
                                <KeyRound size={12} /> Enter new key
                              </button>
                              {isGoogle && (
                                <button
                                  type="button"
                                  className={`cred-mode-btn ${editCredMode === "none" ? "active" : ""}`}
                                  onClick={() => setEditCredMode("none")}
                                >
                                  Cloud Run ADC
                                </button>
                              )}
                            </div>

                            {editCredMode === "new" && (
                              <div className="inline-key-fields">
                                <label className="add-field">
                                  <span>Key Name / Label</span>
                                  <input
                                    value={editNewCredName}
                                    onChange={(e) => setEditNewCredName(e.target.value)}
                                    placeholder={
                                      isGoogle ? "e.g. My Google AI Key" : "e.g. Production Key"
                                    }
                                    maxLength={40}
                                  />
                                </label>
                                <label className="add-field">
                                  <div className="field-header-row">
                                    <span>API Key / Secret</span>
                                    <button
                                      type="button"
                                      className="text-toggle-btn"
                                      onClick={() => setShowEditSecret(!showEditSecret)}
                                    >
                                      {showEditSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                                      {showEditSecret ? "Hide" : "Show"}
                                    </button>
                                  </div>
                                  <input
                                    type={showEditSecret ? "text" : "password"}
                                    value={editNewCredSecret}
                                    onChange={(e) => setEditNewCredSecret(e.target.value)}
                                    placeholder={
                                      isGoogle ? "AIzaSy... or AQ...." : "Paste new API key or secret..."
                                    }
                                    autoComplete="off"
                                    spellCheck={false}
                                  />
                                </label>
                              </div>
                            )}

                            {editCredMode === "existing" && (
                              <label className="add-field">
                                <span>Choose Credential</span>
                                {creds.length === 0 && !isGoogle ? (
                                  <small>
                                    No saved credentials for {editConfig.provider}. Switch to &ldquo;Enter new key&rdquo; above.
                                  </small>
                                ) : (
                                  <select
                                    value={editConfigCredentialId}
                                    onChange={(e) => setEditConfigCredentialId(e.target.value)}
                                  >
                                    {isGoogle && (
                                      <option value="">None (Cloud Run ADC bridge)</option>
                                    )}
                                    {creds.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name} ••••{c.apiKeyLast4}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </label>
                            )}

                            {editCredMode === "none" && isGoogle && (
                              <small className="field-hint">
                                Uses Google ADC configured in Cloud Run bridge (Option B).
                              </small>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setEditConfig(null);
                        setEditConfigDisplayName("");
                        setEditConfigCredentialId("");
                        setEditNewCredName("");
                        setEditNewCredSecret("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        !editConfigDisplayName.trim() ||
                        isSubmittingConfig ||
                        (editConfig.provider !== "cloudflare_workers_ai" &&
                          (editCredMode === "new"
                            ? !editNewCredSecret.trim()
                            : editCredMode === "existing"
                              ? !editConfigCredentialId && editConfig.provider !== "google"
                              : false))
                      }
                      onClick={handleUpdateConfig}
                    >
                      {isSubmittingConfig ? "Saving…" : "Save configuration"}
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
                    const models = addProvider
                      ? remainingModels(addFor, addProvider, existing)
                      : [];
                    const hasRemaining = providers.some(
                      (p) => remainingModels(addFor, p, existing).length > 0,
                    );
                    if (!hasRemaining) {
                      return (
                        <>
                          <p>
                            All allowlisted models for <strong>{addFor}</strong> are already
                            configured. Expand <code>providerAllowlist</code> in{" "}
                            <code>packages/shared/src/types.ts</code> to add more providers/models,
                            then redeploy.
                          </p>
                          <div className="confirm-actions">
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => setAddFor(null)}
                            >
                              Close
                            </button>
                          </div>
                        </>
                      );
                    }
                    const credsForProvider = credentialsByProvider.get(addProvider) ?? [];
                    const isCloudflare = addProvider === "cloudflare_workers_ai";
                    const isGoogle = addProvider === "google";
                    const requiresCred = !isCloudflare && !isGoogle;
                    return (
                      <>
                        <p>
                          Choose a provider and model. Give it a display name. Link a credential of
                          matching provider. Duplicates are rejected.
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
                              setAddCredMode(
                                p === "cloudflare_workers_ai"
                                  ? "none"
                                  : creds.length > 0
                                    ? "existing"
                                    : "new",
                              );
                              setAddNewCredName(
                                p === "google"
                                  ? "Google AI Studio Key"
                                  : p === "deepseek"
                                    ? "DeepSeek Key"
                                    : `${p} Key`,
                              );
                              setAddNewCredSecret("");
                              setShowAddSecret(false);
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
                          {models.length === 0 && (
                            <small>No remaining models for this provider.</small>
                          )}
                        </label>
                        <label className="add-field">
                          <span>Display name</span>
                          <input
                            value={addDisplayName}
                            onChange={(e) => setAddDisplayName(e.target.value)}
                            placeholder="e.g. Google Gemini 3.5 Transcribe"
                            maxLength={40}
                          />
                        </label>
                        {isCloudflare ? (
                          <div className="credential-notice-box">
                            <Cpu size={14} />
                            <span>No API key required — uses Cloudflare Workers AI edge binding.</span>
                          </div>
                        ) : (
                          <div className="credential-box">
                            <div className="field-header-row">
                              <span className="field-label-text">
                                {isGoogle ? "Credential (Google API key or OAuth)" : "Credential"}
                              </span>
                            </div>

                            <div className="cred-mode-picker" role="tablist" aria-label="Credential mode">
                              <button
                                type="button"
                                className={`cred-mode-btn ${addCredMode === "new" ? "active" : ""}`}
                                onClick={() => setAddCredMode("new")}
                              >
                                <KeyRound size={12} /> Enter API key
                              </button>
                              <button
                                type="button"
                                className={`cred-mode-btn ${addCredMode === "existing" ? "active" : ""}`}
                                onClick={() => setAddCredMode("existing")}
                                disabled={credsForProvider.length === 0}
                              >
                                Choose saved key {credsForProvider.length > 0 ? `(${credsForProvider.length})` : ""}
                              </button>
                              {isGoogle && (
                                <button
                                  type="button"
                                  className={`cred-mode-btn ${addCredMode === "none" ? "active" : ""}`}
                                  onClick={() => setAddCredMode("none")}
                                >
                                  Cloud Run ADC (No key)
                                </button>
                              )}
                            </div>

                            {addCredMode === "new" && (
                              <div className="inline-key-fields">
                                <label className="add-field">
                                  <span>Key Name / Label</span>
                                  <input
                                    value={addNewCredName}
                                    onChange={(e) => setAddNewCredName(e.target.value)}
                                    placeholder={
                                      isGoogle
                                        ? "e.g. My Google AI Studio Key"
                                        : addProvider === "deepseek"
                                          ? "e.g. DeepSeek Production Key"
                                          : "e.g. API Key"
                                    }
                                    maxLength={40}
                                  />
                                </label>
                                <label className="add-field">
                                  <div className="field-header-row">
                                    <span>API Key / Secret</span>
                                    <button
                                      type="button"
                                      className="text-toggle-btn"
                                      onClick={() => setShowAddSecret(!showAddSecret)}
                                    >
                                      {showAddSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                                      {showAddSecret ? "Hide" : "Show"}
                                    </button>
                                  </div>
                                  <input
                                    type={showAddSecret ? "text" : "password"}
                                    value={addNewCredSecret}
                                    onChange={(e) => setAddNewCredSecret(e.target.value)}
                                    placeholder={
                                      isGoogle
                                        ? "AIzaSy... or AQ.... (Google AI Studio key)"
                                        : addProvider === "deepseek"
                                          ? "sk-..."
                                          : "Paste API key..."
                                    }
                                    autoComplete="off"
                                    spellCheck={false}
                                  />
                                </label>
                                <small className="field-hint">
                                  {isGoogle
                                    ? "Your Google AI Studio API key is securely encrypted (AES-256-GCM) in D1. It enables real-time Gemini Live WebSocket streaming and batch transcription."
                                    : "Encrypted with AES-256-GCM in Cloudflare D1. Never shared with client browsers."}
                                </small>
                              </div>
                            )}

                            {addCredMode === "existing" && (
                              <label className="add-field">
                                <span>{isGoogle ? "Credential (Google API key or OAuth)" : "Credential (must match provider)"}</span>
                                {credsForProvider.length === 0 ? (
                                  <small>
                                    No credentials for {addProvider}. Switch to &ldquo;Enter API key&rdquo; above.
                                  </small>
                                ) : (
                                  <select
                                    value={addCredentialId}
                                    onChange={(e) => setAddCredentialId(e.target.value)}
                                  >
                                    {isGoogle && <option value="">None (Cloud Run ADC bridge)</option>}
                                    {credsForProvider.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name} ••••{c.apiKeyLast4}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </label>
                            )}

                            {addCredMode === "none" && isGoogle && (
                              <small className="field-hint">
                                Uses Google ADC configured in Cloud Run bridge (Option B).
                              </small>
                            )}
                          </div>
                        )}

                        <label className="add-activate-row">
                          <input
                            type="checkbox"
                            checked={addActivateImmediately}
                            onChange={(e) => setAddActivateImmediately(e.target.checked)}
                          />
                          <div>
                            <strong>Make this model active immediately</strong>
                            <small>
                              Directly switches {addFor?.toUpperCase()} to this configuration upon saving
                            </small>
                          </div>
                        </label>

                        <div className="confirm-actions">
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => setAddFor(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="button"
                            disabled={
                              !addProvider ||
                              !addModel ||
                              !addDisplayName.trim() ||
                              isSubmittingConfig ||
                              (!isCloudflare &&
                                (addCredMode === "new"
                                  ? !addNewCredSecret.trim()
                                  : addCredMode === "existing"
                                    ? !addCredentialId && !isGoogle
                                    : false))
                            }
                            onClick={handleCreateConfig}
                          >
                            {isSubmittingConfig ? "Adding…" : "Add configuration"}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                  {addError && (
                    <div className="admin-provider-feedback error" role="alert">
                      {addError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {showAddCred && (
              <div className="admin-provider-confirm-backdrop" role="dialog" aria-modal="true">
                <div className="admin-provider-confirm add-dialog">
                  <h3>Add credential</h3>
                  <p>
                    Provider + human name + secret. Secret is encrypted (AES-256-GCM) and only
                    ••••last4 is ever shown.
                  </p>
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
                    <input
                      value={credName}
                      onChange={(e) => setCredName(e.target.value)}
                      placeholder="e.g. Google Gemini Voice Key"
                      maxLength={40}
                    />
                  </label>
                  <label className="add-field">
                    <div className="field-header-row">
                      <span>Secret / API Key</span>
                      <button
                        type="button"
                        className="text-toggle-btn"
                        onClick={() => setShowAddCredSecret(!showAddCredSecret)}
                      >
                        {showAddCredSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showAddCredSecret ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showAddCredSecret ? "text" : "password"}
                      value={credSecret}
                      onChange={(e) => setCredSecret(e.target.value)}
                      placeholder="Paste API key (e.g. AIzaSy... or AQ....) or secret"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small>
                      For Google, paste your Google AI Studio API key (AIzaSy... or AQ....), OAuth
                      token, or service account JSON. Secrets are encrypted with AES-256-GCM and only
                      ••••last4 is ever displayed.
                    </small>
                  </label>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setShowAddCred(false);
                        setCredName("");
                        setCredSecret("");
                        setShowAddCredSecret(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        !credProvider ||
                        credName.trim().length < 2 ||
                        credSecret.trim().length < 8 ||
                        createCredMutation.isPending
                      }
                      onClick={() =>
                        createCredMutation.mutate({
                          provider: credProvider,
                          name: credName.trim(),
                          secret: credSecret,
                        })
                      }
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
                  <h3>
                    Edit credential — {editCred.provider} / {editCred.name}
                  </h3>
                  <p>
                    Current: ••••{editCred.apiKeyLast4} — {editCred.usedBy.length} configuration(s)
                    using this credential.
                  </p>
                  <label className="add-field">
                    <span>Name</span>
                    <input
                      value={editCredName}
                      onChange={(e) => setEditCredName(e.target.value)}
                      maxLength={40}
                    />
                  </label>
                  <label className="add-field">
                    <div className="field-header-row">
                      <span>Rotate secret (leave blank to keep)</span>
                      <button
                        type="button"
                        className="text-toggle-btn"
                        onClick={() => setShowEditCredSecret(!showEditCredSecret)}
                      >
                        {showEditCredSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showEditCredSecret ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showEditCredSecret ? "text" : "password"}
                      value={editCredSecret}
                      onChange={(e) => setEditCredSecret(e.target.value)}
                      placeholder="Paste new secret to rotate"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setEditCred(null);
                        setEditCredName("");
                        setEditCredSecret("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        updateCredMutation.isPending ||
                        (editCredName.trim() === editCred.name && !editCredSecret.trim())
                      }
                      onClick={() =>
                        updateCredMutation.mutate({
                          id: editCred.id,
                          name:
                            editCredName.trim() !== editCred.name ? editCredName.trim() : undefined,
                          secret: editCredSecret.trim() || undefined,
                        })
                      }
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
                    Delete{" "}
                    <strong>
                      {deleteCred.provider} / {deleteCred.name} ••••{deleteCred.apiKeyLast4}
                    </strong>
                    ?
                  </p>
                  {deleteCred.usedBy.length > 0 ? (
                    <p style={{ color: "#a00" }}>
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
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
