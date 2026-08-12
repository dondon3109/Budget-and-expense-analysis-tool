import type { AssistantTurnResult } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { prepareAssistantTurn } from "../src/components/assistant/prepareAssistantTurn";

const turn: AssistantTurnResult = {
  thread: {
    id: "thread-1",
    title: "Budget review",
    lastMessageAt: "2026-08-12T10:00:00.000Z",
    createdAt: "2026-08-12T10:00:00.000Z",
  },
  userMessage: {
    id: "user-1",
    threadId: "thread-1",
    role: "user",
    content: "How much did I spend?",
    status: "completed",
    createdAt: "2026-08-12T10:00:00.000Z",
  },
  assistantMessage: {
    id: "assistant-1",
    threadId: "thread-1",
    role: "assistant",
    content: "You spent PHP 1,250 this month.",
    status: "completed",
    createdAt: "2026-08-12T10:00:01.000Z",
  },
};

describe("prepareAssistantTurn", () => {
  it("keeps a spoken turn pending until its generated audio is ready", async () => {
    let finishSpeech!: (audio: Blob) => void;
    const speech = new Promise<Blob>((resolve) => {
      finishSpeech = resolve;
    });
    const getSpeech = vi.fn(() => speech);
    let presented = false;

    const prepared = prepareAssistantTurn({
      send: async () => turn,
      replyMode: "spoken",
      speechVoice: "bright",
      voiceEnabled: true,
      getSpeech,
    });
    void prepared.then(() => {
      presented = true;
    });

    await Promise.resolve();
    expect(presented).toBe(false);

    const audio = new Blob(["spoken reply"], { type: "audio/mpeg" });
    finishSpeech(audio);

    await expect(prepared).resolves.toEqual({ result: turn, voice: { audio } });
    expect(getSpeech).toHaveBeenCalledWith("assistant-1", "bright");
    expect(presented).toBe(true);
  });

  it("releases the text with an inline error when speech generation fails", async () => {
    await expect(
      prepareAssistantTurn({
        send: async () => turn,
        replyMode: "spoken",
        voiceEnabled: true,
        getSpeech: async () => {
          throw new Error("Speech generation timed out. Try another voice question.");
        },
      }),
    ).resolves.toEqual({
      result: turn,
      voice: { error: "Speech generation timed out. Try another voice question." },
    });
  });
});
