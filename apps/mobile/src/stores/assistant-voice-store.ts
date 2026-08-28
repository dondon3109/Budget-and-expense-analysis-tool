import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";

import type { AssistantSpeechVoice } from "@/api/assistant-voice";

// Device-local assistant voice options. These are interface preferences, not
// financial data, and the persisted shape is versioned and Zod-validated.
// Consent itself lives on the server: the Worker decides whether voice is
// enabled, and these options only shape how replies are presented.

export type AssistantReplyMode = "text" | "voice";

const persistedVoiceOptionsSchema = z
  .object({
    subject: z.string().nullable(),
    replyMode: z.enum(["text", "voice"]),
    voice: z.enum(["default", "bright", "energetic"]),
  })
  .passthrough();

const persistedVoiceEnvelopeSchema = z
  .object({
    state: persistedVoiceOptionsSchema,
    version: z.literal(1),
  })
  .passthrough();

export type PersistedAssistantVoiceOptions = {
  subject: string | null;
  replyMode: AssistantReplyMode;
  voice: AssistantSpeechVoice;
};

/** Validates rehydrated device-local voice options; malformed state fails closed to defaults. */
export function parsePersistedAssistantVoiceOptions(
  value: unknown,
): PersistedAssistantVoiceOptions | null {
  const parsed = persistedVoiceEnvelopeSchema.safeParse({ state: value, version: 1 });
  if (!parsed.success) return null;
  const state = parsed.data.state as Record<string, unknown>;
  const core = persistedVoiceOptionsSchema.safeParse({
    subject: state.subject,
    replyMode: state.replyMode,
    voice: state.voice,
  });
  if (!core.success) return null;
  return {
    subject: core.data.subject,
    replyMode: core.data.replyMode,
    voice: core.data.voice,
  };
}

export const assistantSpeechVoiceOptions: {
  id: AssistantSpeechVoice;
  label: string;
}[] = [
  { id: "default", label: "Default" },
  { id: "bright", label: "Bright" },
  { id: "energetic", label: "Energetic" },
];

const secureVoiceStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface AssistantVoiceOptionsState {
  subject: string | null;
  replyMode: AssistantReplyMode;
  voice: AssistantSpeechVoice;
  setReplyMode: (mode: AssistantReplyMode) => void;
  setVoice: (voice: AssistantSpeechVoice) => void;
  ensureSubject: (subject: string | null) => void;
}

const defaults = {
  subject: null,
  replyMode: "text" as const,
  voice: "default" as const,
};

export const useAssistantVoiceOptionsStore = create<AssistantVoiceOptionsState>()(
  persist(
    (set) => ({
      ...defaults,
      setReplyMode: (replyMode) => set({ replyMode }),
      setVoice: (voice) => set({ voice }),
      ensureSubject: (subject) =>
        set((state) => (state.subject === subject ? state : { ...defaults, subject })),
    }),
    {
      name: "zoption-mobile-assistant-voice-v1",
      version: 1,
      storage: createJSONStorage(() => secureVoiceStorage),
      partialize: ({ subject, replyMode, voice }) => ({
        subject,
        replyMode,
        voice,
      }),
      merge: (persisted, current) => {
        const result = parsePersistedAssistantVoiceOptions(persisted);
        return result ? { ...current, ...result } : { ...current, ...defaults };
      },
      skipHydration: true,
    },
  ),
);
