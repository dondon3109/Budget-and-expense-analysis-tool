import { useQueryClient } from "@tanstack/react-query";
import { providerAllowlist } from "@zoption/shared";
import type { ProviderConfig, ProviderCredentialWithUsage, ProviderService } from "@zoption/shared";
import { Cpu, KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";

import {
  activateProviderConfig,
  createProviderConfig,
  createProviderCredential,
  listCredentialModels,
  previewProviderModels,
  updateProviderConfig,
} from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import {
  ASSISTANT_CREDENTIAL_LABELS,
  AdminProviderDialog,
  SecretField,
  defaultCredentialName,
  errorMessage,
} from "./AdminProviderDialog";

const ASSISTANT_KEY_PLACEHOLDERS: Record<string, string> = {
  deepseek: "sk-...",
  openai: "sk-... (OpenAI)",
  anthropic: "sk-ant-... (Anthropic)",
  gemini: "AIzaSy... (Google AI Studio)",
  meta: "Paste Meta Llama API key...",
  muse_spark: "Paste Muse Spark API key...",
};

/** Model select sentinel for a manually entered model ID. */
const CUSTOM_MODEL_VALUE = "__custom";

type CredentialMode = "existing" | "new" | "none";
type CredentialsByProvider = Map<string, ProviderCredentialWithUsage[]>;

function resolveAddModel(model: string, custom: string): string {
  return model === CUSTOM_MODEL_VALUE ? custom.trim() : model;
}

function availableProviders(service: ProviderService): string[] {
  return Object.keys(providerAllowlist[service] ?? {});
}

function remainingModels(
  service: ProviderService,
  provider: string,
  existing: ProviderConfig[],
): string[] {
  const all = providerAllowlist[service]?.[provider] ?? [];
  const used = new Set(existing.filter((c) => c.provider === provider).map((c) => c.model));
  return all.filter((m) => !used.has(m));
}

function initialSelection(service: ProviderService, existing: ProviderConfig[]) {
  const providers = availableProviders(service);
  // For STT, prefer "google" if it has remaining models because cloudflare is already configured by default
  let provider = providers[0] ?? "";
  if (service === "stt" && providers.includes("google")) {
    if (remainingModels(service, "google", existing).length > 0) provider = "google";
  }
  let model = provider ? (remainingModels(service, provider, existing)[0] ?? "") : "";
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
  const displayName =
    provider === "google" && model.includes("live")
      ? "Google Gemini 3.5 Transcribe Live"
      : provider && model
        ? `${provider} / ${model}`
        : "";
  return { provider, model, displayName };
}

/** Resolves the credential a create or edit should link, creating one from a pasted key. */
async function resolveCredentialId(
  workspace: AuthenticatedWorkspace,
  provider: string,
  mode: CredentialMode,
  selectedId: string,
  newName: string,
  newSecret: string,
  noneAllowed: boolean,
): Promise<string | null> {
  const isGoogle = provider === "google";
  if (mode === "new") {
    if (!newSecret.trim()) throw new Error("Please enter an API key or secret.");
    const created = await createProviderCredential(workspace, {
      provider,
      name: newName.trim() || defaultCredentialName(provider),
      secret: newSecret.trim(),
    });
    return created.id;
  }
  if (mode === "existing") {
    if (!selectedId && !isGoogle) {
      throw new Error("Please select a saved credential or enter an API key.");
    }
    return selectedId || null;
  }
  if (!noneAllowed && !isGoogle) throw new Error("This provider requires an API key.");
  return null;
}

interface AddConfigDialogProps {
  workspace: AuthenticatedWorkspace;
  service: ProviderService;
  existing: ProviderConfig[];
  credentialsByProvider: CredentialsByProvider;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AddConfigDialog({
  workspace,
  service,
  existing,
  credentialsByProvider,
  onClose,
  onSaved,
}: AddConfigDialogProps) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => initialSelection(service, existing));
  const initialCreds = credentialsByProvider.get(initial.provider) ?? [];
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [credentialId, setCredentialId] = useState(initialCreds[0]?.id ?? "");
  const [credMode, setCredMode] = useState<CredentialMode>(
    initial.provider === "cloudflare_workers_ai"
      ? "none"
      : initialCreds.length > 0
        ? "existing"
        : "new",
  );
  const [newCredName, setNewCredName] = useState(defaultCredentialName(initial.provider));
  const [newCredSecret, setNewCredSecret] = useState("");
  const [activateImmediately, setActivateImmediately] = useState(true);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string>();
  const [customModel, setCustomModel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Errors render inside the dialog. It is a full-viewport scrim, so anything
  // routed to the page-level error is painted underneath and the save looks
  // like a dead click.
  const [error, setError] = useState<string>();

  const providers = availableProviders(service);
  const models = fetchedModels ?? (provider ? remainingModels(service, provider, existing) : []);
  // Assistant configs may use any live-fetched model, so the dialog
  // stays open even when every curated model is configured.
  const hasRemaining =
    service === "assistant" ||
    providers.some((p) => remainingModels(service, p, existing).length > 0);
  const credsForProvider = credentialsByProvider.get(provider) ?? [];
  const isCloudflare = provider === "cloudflare_workers_ai";
  const isGoogle = provider === "google";

  function selectProvider(p: string) {
    const rem = remainingModels(service, p, existing);
    const creds = credentialsByProvider.get(p) ?? [];
    setProvider(p);
    setFetchedModels(null);
    setCustomModel("");
    setFetchModelsError(undefined);
    setModel(rem[0] ?? "");
    setCredentialId(creds[0]?.id ?? "");
    setCredMode(p === "cloudflare_workers_ai" ? "none" : creds.length > 0 ? "existing" : "new");
    setNewCredName(defaultCredentialName(p));
    setNewCredSecret("");
    setDisplayName(p && rem[0] ? `${p} / ${rem[0]}` : "");
  }

  async function handleFetchModels() {
    if (!provider || fetchingModels) return;
    setFetchingModels(true);
    setFetchModelsError(undefined);
    try {
      const result =
        credMode === "new"
          ? await previewProviderModels(workspace, { provider, secret: newCredSecret.trim() })
          : await listCredentialModels(workspace, credentialId);
      const used = new Set(existing.filter((c) => c.provider === provider).map((c) => c.model));
      const base = remainingModels(service, provider, existing);
      const extras = result.models.filter((m) => !base.includes(m) && !used.has(m));
      const all = [...base, ...extras];
      setFetchedModels(all);
      if (model && model !== CUSTOM_MODEL_VALUE && !all.includes(model)) {
        const next = all[0] ?? "";
        setModel(next);
        setDisplayName(provider && next ? `${provider} / ${next}` : "");
      } else if (!model && extras.length > 0 && base.length === 0) {
        setModel(extras[0]!);
        setDisplayName(`${provider} / ${extras[0]}`);
      }
      if (result.models.length === 0) {
        setFetchModelsError("The provider returned no models for this key.");
      }
    } catch (err) {
      setFetchModelsError(errorMessage(err, "Could not fetch models."));
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleCreate() {
    const effectiveModel = resolveAddModel(model, customModel);
    if (!provider || !effectiveModel || !displayName.trim()) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const linkedId = isCloudflare
        ? null
        : await resolveCredentialId(
            workspace,
            provider,
            credMode,
            credentialId,
            newCredName,
            newCredSecret,
            false,
          );
      if (!isCloudflare && credMode === "new") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      }
      const created = await createProviderConfig(workspace, {
        service,
        provider,
        model: effectiveModel,
        displayName: displayName.trim(),
        credentialId: linkedId,
      });

      let message = `Added ${created.service} → ${created.displayName}`;
      if (activateImmediately) {
        try {
          await activateProviderConfig(workspace, created.id);
          message = `Added and activated ${created.service} → ${created.displayName}`;
        } catch {
          message = `Added ${created.service} → ${created.displayName} (activation pending)`;
        }
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) });
      onSaved(message);
    } catch (err) {
      setError(errorMessage(err, "Failed to create configuration."));
      setIsSubmitting(false);
    }
  }

  return (
    <AdminProviderDialog label={`Add ${service} configuration`} onClose={onClose}>
      <div className="admin-provider-confirm add-dialog">
        <h3>Add {service} configuration</h3>
        {!hasRemaining ? (
          <>
            <p>
              All allowlisted models for <strong>{service}</strong> are already configured. Expand{" "}
              <code>providerAllowlist</code> in <code>packages/shared/src/types.ts</code> to add
              more providers/models, then redeploy.
            </p>
            <div className="confirm-actions">
              <button type="button" className="button secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Choose a provider and model. Give it a display name. Link a credential of matching
              provider. Duplicates are rejected.
            </p>
            <label className="add-field">
              <span>Provider</span>
              <select value={provider} onChange={(e) => selectProvider(e.target.value)}>
                {providers.map((p) => {
                  const rem = remainingModels(service, p, existing);
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
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {service === "assistant" && (
                  <option value={CUSTOM_MODEL_VALUE}>Other (enter manually)…</option>
                )}
              </select>
              {models.length === 0 && model !== CUSTOM_MODEL_VALUE && (
                <small>No remaining models for this provider.</small>
              )}
            </label>
            {service === "assistant" && model === CUSTOM_MODEL_VALUE && (
              <label className="add-field">
                <span>Custom model ID</span>
                <input
                  value={customModel}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCustomModel(next);
                    if (!displayName.trim() || displayName.startsWith(`${provider} /`)) {
                      setDisplayName(provider && next.trim() ? `${provider} / ${next.trim()}` : "");
                    }
                  }}
                  placeholder="e.g. muse-spark-1.3"
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                />
                <small className="field-hint">
                  Use the exact vendor model ID. It must support tool calling to work with the
                  assistant.
                </small>
              </label>
            )}
            {service === "assistant" && (
              <div className="add-field">
                <button
                  type="button"
                  className="button secondary compact"
                  disabled={
                    fetchingModels ||
                    (credMode === "new"
                      ? newCredSecret.trim().length < 8
                      : credMode === "existing"
                        ? !credentialId
                        : true)
                  }
                  onClick={handleFetchModels}
                  title="List the models this key can access, then choose one"
                >
                  <RefreshCw size={13} />
                  {fetchingModels ? "Fetching models…" : "Fetch live models"}
                </button>{" "}
                <small className="field-hint">
                  {fetchedModels
                    ? `${fetchedModels.length} models available (curated first). Only models supporting tool calling work with the assistant.`
                    : "Enter a key above (or pick a saved one), then fetch what it can access."}
                </small>
                {fetchModelsError && (
                  <div className="admin-provider-feedback error" role="alert">
                    {fetchModelsError}
                  </div>
                )}
              </div>
            )}
            <label className="add-field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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
                    className={`cred-mode-btn ${credMode === "new" ? "active" : ""}`}
                    onClick={() => setCredMode("new")}
                  >
                    <KeyRound size={12} /> Enter API key
                  </button>
                  <button
                    type="button"
                    className={`cred-mode-btn ${credMode === "existing" ? "active" : ""}`}
                    onClick={() => setCredMode("existing")}
                    disabled={credsForProvider.length === 0}
                  >
                    Choose saved key{" "}
                    {credsForProvider.length > 0 ? `(${credsForProvider.length})` : ""}
                  </button>
                  {isGoogle && (
                    <button
                      type="button"
                      className={`cred-mode-btn ${credMode === "none" ? "active" : ""}`}
                      onClick={() => setCredMode("none")}
                    >
                      Cloud Run ADC (No key)
                    </button>
                  )}
                </div>

                {credMode === "new" && (
                  <div className="inline-key-fields">
                    <label className="add-field">
                      <span>Key Name / Label</span>
                      <input
                        value={newCredName}
                        onChange={(e) => setNewCredName(e.target.value)}
                        placeholder={
                          isGoogle
                            ? "e.g. My Google AI Studio Key"
                            : `e.g. ${ASSISTANT_CREDENTIAL_LABELS[provider] ?? "API Key"}`
                        }
                        maxLength={40}
                      />
                    </label>
                    <SecretField
                      label="API Key / Secret"
                      value={newCredSecret}
                      onChange={setNewCredSecret}
                      placeholder={
                        isGoogle
                          ? "AIzaSy... or AQ.... (Google AI Studio key)"
                          : (ASSISTANT_KEY_PLACEHOLDERS[provider] ?? "Paste API key...")
                      }
                    />
                    <small className="field-hint">
                      {isGoogle
                        ? "Your Google AI Studio API key is securely encrypted (AES-256-GCM) in D1. It enables real-time Gemini Live WebSocket streaming and batch transcription."
                        : "Encrypted with AES-256-GCM in Cloudflare D1. Never shared with client browsers."}
                    </small>
                  </div>
                )}

                {credMode === "existing" && (
                  <label className="add-field">
                    <span>
                      {isGoogle
                        ? "Credential (Google API key or OAuth)"
                        : "Credential (must match provider)"}
                    </span>
                    {credsForProvider.length === 0 ? (
                      <small>
                        No credentials for {provider}. Switch to &ldquo;Enter API key&rdquo; above.
                      </small>
                    ) : (
                      <select
                        value={credentialId}
                        onChange={(e) => setCredentialId(e.target.value)}
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

                {credMode === "none" && isGoogle && (
                  <small className="field-hint">
                    Uses Google ADC configured in Cloud Run bridge (Option B).
                  </small>
                )}
              </div>
            )}

            <label className="add-activate-row">
              <input
                type="checkbox"
                checked={activateImmediately}
                onChange={(e) => setActivateImmediately(e.target.checked)}
              />
              <div>
                <strong>Make this model active immediately</strong>
                <small>
                  Directly switches {service.toUpperCase()} to this configuration upon saving
                </small>
              </div>
            </label>

            <div className="confirm-actions">
              <button type="button" className="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={
                  !provider ||
                  !resolveAddModel(model, customModel) ||
                  !displayName.trim() ||
                  isSubmitting ||
                  (!isCloudflare &&
                    (credMode === "new"
                      ? !newCredSecret.trim()
                      : credMode === "existing"
                        ? !credentialId && !isGoogle
                        : false))
                }
                onClick={handleCreate}
              >
                {isSubmitting ? "Adding…" : "Add configuration"}
              </button>
            </div>
          </>
        )}
        {error && (
          <div className="admin-provider-feedback error" role="alert">
            {error}
          </div>
        )}
      </div>
    </AdminProviderDialog>
  );
}

interface EditConfigDialogProps {
  workspace: AuthenticatedWorkspace;
  config: ProviderConfig;
  credentialsByProvider: CredentialsByProvider;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function EditConfigDialog({
  workspace,
  config,
  credentialsByProvider,
  onClose,
  onSaved,
}: EditConfigDialogProps) {
  const queryClient = useQueryClient();
  const creds = credentialsByProvider.get(config.provider) ?? [];
  const isGoogle = config.provider === "google";
  const isCloudflare = config.provider === "cloudflare_workers_ai";
  const [displayName, setDisplayName] = useState(config.displayName);
  const [credentialId, setCredentialId] = useState(config.credentialId ?? "");
  const [credMode, setCredMode] = useState<CredentialMode>(
    config.credentialId ? "existing" : isGoogle ? "none" : creds.length > 0 ? "existing" : "new",
  );
  const [newCredName, setNewCredName] = useState(defaultCredentialName(config.provider));
  const [newCredSecret, setNewCredSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleUpdate() {
    if (!displayName.trim()) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      const linkedId = isCloudflare
        ? credentialId || null
        : await resolveCredentialId(
            workspace,
            config.provider,
            credMode,
            credentialId,
            newCredName,
            newCredSecret,
            true,
          );
      const updated = await updateProviderConfig(workspace, config.id, {
        displayName: displayName.trim(),
        credentialId: linkedId,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigAudits(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) });
      onSaved(`Updated configuration: ${updated.displayName}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to update configuration."));
      setIsSubmitting(false);
    }
  }

  return (
    <AdminProviderDialog label="Edit configuration" onClose={onClose}>
      <div className="admin-provider-confirm add-dialog">
        <h3>Edit configuration — {config.displayName}</h3>
        <p>
          Provider: <strong>{config.provider}</strong> · Model: <code>{config.model}</code>
        </p>
        <label className="add-field">
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
          />
        </label>
        {isCloudflare ? (
          <small>Workers AI binding is managed by Cloudflare configuration.</small>
        ) : (
          <div className="credential-box">
            <div className="field-header-row">
              <span className="field-label-text">Credential</span>
            </div>
            <div className="cred-mode-picker" role="tablist" aria-label="Credential mode">
              <button
                type="button"
                className={`cred-mode-btn ${credMode === "existing" ? "active" : ""}`}
                onClick={() => setCredMode("existing")}
                disabled={creds.length === 0 && !isGoogle}
              >
                Saved key {creds.length > 0 ? `(${creds.length})` : ""}
              </button>
              <button
                type="button"
                className={`cred-mode-btn ${credMode === "new" ? "active" : ""}`}
                onClick={() => setCredMode("new")}
              >
                <KeyRound size={12} /> Enter new key
              </button>
              {isGoogle && (
                <button
                  type="button"
                  className={`cred-mode-btn ${credMode === "none" ? "active" : ""}`}
                  onClick={() => setCredMode("none")}
                >
                  Cloud Run ADC
                </button>
              )}
            </div>

            {credMode === "new" && (
              <div className="inline-key-fields">
                <label className="add-field">
                  <span>Key Name / Label</span>
                  <input
                    value={newCredName}
                    onChange={(e) => setNewCredName(e.target.value)}
                    placeholder={isGoogle ? "e.g. My Google AI Key" : "e.g. Production Key"}
                    maxLength={40}
                  />
                </label>
                <SecretField
                  label="API Key / Secret"
                  value={newCredSecret}
                  onChange={setNewCredSecret}
                  placeholder={isGoogle ? "AIzaSy... or AQ...." : "Paste new API key or secret..."}
                />
              </div>
            )}

            {credMode === "existing" && (
              <label className="add-field">
                <span>Choose Credential</span>
                {creds.length === 0 && !isGoogle ? (
                  <small>
                    No saved credentials for {config.provider}. Switch to &ldquo;Enter new
                    key&rdquo; above.
                  </small>
                ) : (
                  <select value={credentialId} onChange={(e) => setCredentialId(e.target.value)}>
                    {isGoogle && <option value="">None (Cloud Run ADC bridge)</option>}
                    {creds.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ••••{c.apiKeyLast4}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            {credMode === "none" && isGoogle && (
              <small className="field-hint">
                Uses Google ADC configured in Cloud Run bridge (Option B).
              </small>
            )}
          </div>
        )}
        <div className="confirm-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={
              !displayName.trim() ||
              isSubmitting ||
              (!isCloudflare &&
                (credMode === "new"
                  ? !newCredSecret.trim()
                  : credMode === "existing"
                    ? !credentialId && !isGoogle
                    : false))
            }
            onClick={handleUpdate}
          >
            {isSubmitting ? "Saving…" : "Save configuration"}
          </button>
        </div>
        {error && (
          <div className="admin-provider-feedback error" role="alert">
            {error}
          </div>
        )}
      </div>
    </AdminProviderDialog>
  );
}
