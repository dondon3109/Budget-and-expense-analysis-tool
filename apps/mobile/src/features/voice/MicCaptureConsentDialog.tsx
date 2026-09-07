import { ConfirmationDialog } from "@/ui/components";

import {
  MIC_CAPTURE_CONSENT_CONFIRM_LABEL,
  MIC_CAPTURE_CONSENT_MESSAGE,
  MIC_CAPTURE_CONSENT_TITLE,
} from "./mic-capture-consent";

/**
 * Explicit opt-in dialog for widget / quick-capture microphone input. Uses
 * the mic-capture consent copy (with the in-flight no-store guarantee), not
 * the assistant-voice or receipt consent notices.
 */
export function MicCaptureConsentDialog({
  visible,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      visible={visible}
      title={MIC_CAPTURE_CONSENT_TITLE}
      message={MIC_CAPTURE_CONSENT_MESSAGE}
      confirmLabel={busy ? "Enabling…" : MIC_CAPTURE_CONSENT_CONFIRM_LABEL}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
