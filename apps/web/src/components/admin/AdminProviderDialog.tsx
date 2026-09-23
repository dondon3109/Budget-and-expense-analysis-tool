import { Eye, EyeOff } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";

export const ASSISTANT_CREDENTIAL_LABELS: Record<string, string> = {
  deepseek: "DeepSeek Key",
  openai: "OpenAI Key",
  anthropic: "Anthropic Key",
  gemini: "Gemini Key",
  meta: "Meta Key",
  muse_spark: "Muse Spark Key",
};

export function defaultCredentialName(provider: string): string {
  return provider === "google"
    ? "Google AI Studio Key"
    : (ASSISTANT_CREDENTIAL_LABELS[provider] ?? `${provider} Key`);
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface AdminProviderDialogProps {
  /** Accessible name for the dialog; matches its visible heading. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Modal shell for the provider admin dialogs. Portals to document.body before
 * taking the root lock: these dialogs used to render inside #root, so inerting
 * #root would have inerted the dialog itself. Traps Tab, closes on Escape, and
 * returns focus to whatever opened it.
 */
export function AdminProviderDialog({ label, onClose, children }: AdminProviderDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  useRootLock(true);
  const handleKeyDown = useFocusTrap(backdropRef, { onEscape: onClose });

  return createPortal(
    <div
      ref={backdropRef}
      className="admin-provider-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}

interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}

/** Masked secret input with a Show/Hide toggle; children render as the field hint. */
export function SecretField({ label, value, onChange, placeholder, children }: SecretFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="add-field">
      <div className="field-header-row">
        <span>{label}</span>
        <button type="button" className="text-toggle-btn" onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={12} /> : <Eye size={12} />}
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {children}
    </label>
  );
}
