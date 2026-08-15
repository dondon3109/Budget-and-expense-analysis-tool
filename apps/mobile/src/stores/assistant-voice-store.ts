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
    autoSend: z.boolean(),
  })
  .strict();

const persistedVoiceEnvelopeSchema = z
  .object({
    state: persistedVoiceOptionsSchema,
    version: z.literal(1),
  })
  .strict();

export type PersistedAssistantVoiceOptions = z.infer<
  typeof persistedVoiceEnvelopeSchema
>["state"];

/** Validates rehydrated device-local voice options; malformed state fails closed to defaults. */
export function parsePersistedAssistantVoiceOptions(
  value: unknown,
): PersistedAssistantVoiceOptions | null {
  const parsed = persistedVoiceEnvelopeSchema.safeParse({ state: value, version: 1 });
  return parsed.success ? parsed.data.state : null;
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
  autoSend: boolean;
  setReplyMode: (mode: AssistantReplyMode) => void;
  setVoice: (voice: AssistantSpeechVoice) => void;
  setAutoSend: (autoSend: boolean) => void;
  ensureSubject: (subject: string | null) => void;
}

const defaults = {
  subject: null,
  replyMode: "text" as const,
  voice: "default" as const,
  autoSend: true,
};

export const useAssistantVoiceOptionsStore = create<AssistantVoiceOptionsState>()(
  persist(
    (set) => ({
      ...defaults,
      setReplyMode: (replyMode) => set({ replyMode }),
      setVoice: (voice) => set({ voice }),
      setAutoSend: (autoSend) => set({ autoSend }),
      ensureSubject: (subject) =>
        set((state) => (state.subject === subject ? state : { ...defaults, subject })),
    }),
    {
      name: "zoption-mobile-assistant-voice-v1",
      version: 1,
      storage: createJSONStorage(() => secureVoiceStorage),
      partialize: ({ subject, replyMode, voice, autoSend }) => ({
        subject,
        replyMode,
        voice,
        autoSend,
      }),
      merge: (persisted, current) => {
        const result = parsePersistedAssistantVoiceOptions(persisted);
        return result ? { ...current, ...result } : { ...current, ...defaults };
      },
      skipHydration: true,
    },
  ),
);
