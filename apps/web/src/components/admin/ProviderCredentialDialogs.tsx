import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProviderCredentialWithUsage } from "@zoption/shared";
import { useState } from "react";

import { createProviderCredential, updateProviderCredential } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { AdminProviderDialog, SecretField, errorMessage } from "./AdminProviderDialog";

const CREDENTIAL_PROVIDERS = [
  "deepseek",
  "openai",
  "anthropic",
  "gemini",
  "meta",
  "muse_spark",
  "google",
  "fish_audio",
];

interface AddCredentialDialogProps {
  workspace: AuthenticatedWorkspace;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AddCredentialDialog({ workspace, onClose, onSaved }: AddCredentialDialogProps) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState("deepseek");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createProviderCredential(workspace, { provider, name: name.trim(), secret }),
    onSuccess: (c) => {
      onSaved(`Created credential ${c.provider} / ${c.name} ••••${c.apiKeyLast4}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) });
    },
  });

  return (
    <AdminProviderDialog label="Add credential" onClose={onClose}>
      <div className="admin-provider-confirm add-dialog">
        <h3>Add credential</h3>
        <p>
          Provider + human name + secret. Secret is encrypted (AES-256-GCM) and only ••••last4 is
          ever shown.
        </p>
        <label className="add-field">
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {CREDENTIAL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="add-field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Google Gemini Voice Key"
            maxLength={40}
          />
        </label>
        <SecretField
          label="Secret / API Key"
          value={secret}
          onChange={setSecret}
          placeholder="Paste API key (e.g. AIzaSy... or AQ....) or secret"
        >
          <small>
            For Google, paste your Google AI Studio API key (AIzaSy... or AQ....), OAuth token, or
            service account JSON. Secrets are encrypted with AES-256-GCM and only ••••last4 is ever
            displayed.
          </small>
        </SecretField>
        <div className="confirm-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={
              name.trim().length < 2 || secret.trim().length < 8 || createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating…" : "Create credential"}
          </button>
        </div>
        {createMutation.isError && (
          <div className="admin-provider-feedback error" role="alert">
            {errorMessage(createMutation.error, "Create credential failed.")}
          </div>
        )}
      </div>
    </AdminProviderDialog>
  );
}

interface EditCredentialDialogProps {
  workspace: AuthenticatedWorkspace;
  credential: ProviderCredentialWithUsage;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function EditCredentialDialog({
  workspace,
  credential,
  onClose,
  onSaved,
}: EditCredentialDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(credential.name);
  const [secret, setSecret] = useState("");
  const trimmedName = name.trim();

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProviderCredential(workspace, credential.id, {
        ...(trimmedName && trimmedName !== credential.name ? { name: trimmedName } : {}),
        ...(secret.trim() ? { secret: secret.trim() } : {}),
      }),
    onSuccess: (c) => {
      onSaved(`Updated credential ${c.name} ••••${c.apiKeyLast4}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerCredentials(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerHealth(workspace) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs(workspace) });
    },
  });

  return (
    <AdminProviderDialog label="Edit credential" onClose={onClose}>
      <div className="admin-provider-confirm add-dialog">
        <h3>
          Edit credential — {credential.provider} / {credential.name}
        </h3>
        <p>
          Current: ••••{credential.apiKeyLast4} — {credential.usedBy.length} configuration(s) using
          this credential.
        </p>
        <label className="add-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <SecretField
          label="Rotate secret (leave blank to keep)"
          value={secret}
          onChange={setSecret}
          placeholder="Paste new secret to rotate"
        />
        <div className="confirm-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={
              updateMutation.isPending || (trimmedName === credential.name && !secret.trim())
            }
            onClick={() => updateMutation.mutate()}
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
        {updateMutation.isError && (
          <div className="admin-provider-feedback error" role="alert">
            {errorMessage(updateMutation.error, "Update credential failed.")}
          </div>
        )}
      </div>
    </AdminProviderDialog>
  );
}
