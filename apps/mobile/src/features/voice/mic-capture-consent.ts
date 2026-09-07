import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

/**
 * Separate mic-capture consent for widget / quick-capture microphone input.
 *
 * This is deliberately distinct from assistant-voice consent
 * (`CURRENT_ASSISTANT_VOICE_CONSENT_VERSION`) and from receipt/AI-entry
 * consent (`CURRENT_RECEIPT_CONSENT_VERSION`): those cover conversational
 * replies and AI-drafted entries, while this covers the act of capturing
 * microphone audio itself from quick entry surfaces. Each surface keeps its
 * own explicit opt-in with its own version counter, so rewording one notice
 * never silently re-consents another.
 */

// Device-local mic-capture consent. The persisted shape is versioned and
// Zod-validated; malformed state fails closed to "not consented".
export const MIC_CAPTURE_CONSENT_VERSION = 1;

export interface MicCapturePreferences {
  consentedAt: string | null;
  consentVersion: number;
}

const persistedMicCaptureConsentSchema = z
  .object({
    consentedAt: z.string().nullable(),
    consentVersion: z.number().int().min(0),
  })
  .passthrough();

const persistedMicCaptureEnvelopeSchema = z
  .object({
    state: persistedMicCaptureConsentSchema,
    version: z.literal(1),
  })
  .passthrough();

/** Validates rehydrated mic-capture consent; malformed state fails closed to null (not consented). */
export function parsePersistedMicCaptureConsent(value: unknown): MicCapturePreferences | null {
  const parsed = persistedMicCaptureEnvelopeSchema.safeParse({ state: value, version: 1 });
  if (!parsed.success) return null;
  return {
    consentedAt: parsed.data.state.consentedAt,
    consentVersion: parsed.data.state.consentVersion,
  };
}

/**
 * Gate for quick-capture microphone surfaces. Consent is required when there
 * is no record, when it was never granted, or when it was granted under an
 * older notice version (re-consent on wording changes).
 */
export function requiresMicCaptureConsent(
  preferences: MicCapturePreferences | null,
): boolean {
  return (
    preferences === null ||
    preferences.consentedAt === null ||
    preferences.consentVersion !== MIC_CAPTURE_CONSENT_VERSION
  );
}

export function grantMicCaptureConsent(now: Date = new Date()): MicCapturePreferences {
  return { consentedAt: now.toISOString(), consentVersion: MIC_CAPTURE_CONSENT_VERSION };
}

/**
 * User-facing privacy guarantee for in-flight no-store audio. Captures are
 * transcribed without server-side persistence: the recording lives in the
 * temporary recorder file, is uploaded once, is held in server memory only
 * for the duration of transcription, and is discarded from this device as
 * soon as the upload settles (see discardTemporarySourceFile). No audio
 * artifact is stored on either side.
 */
export const NO_STORE_USER_COPY =
  "Private by design: captures are transcribed in flight and never stored. " +
  "The recording is deleted from this device right after upload and is kept " +
  "in server memory only while it is being transcribed.";

export const MIC_CAPTURE_CONSENT_TITLE = "Allow microphone capture?";

export const MIC_CAPTURE_CONSENT_MESSAGE =
  "Zoption uses the microphone only when you tap to capture. " + NO_STORE_USER_COPY;

export const MIC_CAPTURE_CONSENT_CONFIRM_LABEL = "Allow microphone";

const secureMicCaptureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface MicCaptureConsentState extends MicCapturePreferences {
  grant: () => void;
  reset: () => void;
}

const defaults: MicCapturePreferences = {
  consentedAt: null,
  consentVersion: 0,
};

export const useMicCaptureConsentStore = create<MicCaptureConsentState>()(
  persist(
    (set) => ({
      ...defaults,
      grant: () => set(grantMicCaptureConsent()),
      reset: () => set({ ...defaults }),
    }),
    {
      name: "zoption-mobile-mic-capture-consent-v1",
      version: 1,
      storage: createJSONStorage(() => secureMicCaptureStorage),
      partialize: ({ consentedAt, consentVersion }) => ({ consentedAt, consentVersion }),
      merge: (persisted, current) => {
        const result = parsePersistedMicCaptureConsent(persisted);
        return result ? { ...current, ...result } : { ...current, ...defaults };
      },
      skipHydration: true,
    },
  ),
);
