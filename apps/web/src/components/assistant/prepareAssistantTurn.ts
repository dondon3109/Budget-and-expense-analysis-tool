import type { AssistantTurnResult } from "@zoption/shared";

import type { AssistantVoiceReplyMode } from "./AssistantVoiceControl";

export interface PreparedAssistantTurn {
  result: AssistantTurnResult;
  voice?: { audio: Blob; error?: never } | { audio?: never; error: string };
}

interface PrepareAssistantTurnOptions {
  send: () => Promise<AssistantTurnResult>;
  replyMode?: AssistantVoiceReplyMode;
  voiceEnabled: boolean;
  getSpeech: (assistantMessageId: string) => Promise<Blob>;
  onSpeechPending?: () => void;
}

/** Keeps a spoken turn pending until its text and generated audio can be presented together. */
export async function prepareAssistantTurn({
  send,
  replyMode,
  voiceEnabled,
  getSpeech,
  onSpeechPending,
}: PrepareAssistantTurnOptions): Promise<PreparedAssistantTurn> {
  const result = await send();
  if (!voiceEnabled || replyMode !== "spoken") return { result };

  onSpeechPending?.();
  try {
    return {
      result,
      voice: { audio: await getSpeech(result.assistantMessage.id) },
    };
  } catch (error) {
    return {
      result,
      voice: {
        error:
          error instanceof Error
            ? error.message
            : "The spoken reply could not be prepared. You can still read the answer above.",
      },
    };
  }
}
