import {
  clearDummyAssistantMemory,
  createDummyAssistantThreadTurn,
  deleteAllDummyAssistantThreads,
  deleteDummyAssistantThread,
  extractDummyReceipt,
  extractDummyVoiceTransaction,
  getDummyAssistantMemory,
  getDummyAssistantMemoryPreferences,
  getDummyAssistantPreferences,
  getDummyAssistantVoicePreferences,
  getDummyReceiptPreferences,
  grantDummyAssistantVoiceConsent,
  isDummyAssistantToken,
  listDummyAssistantMessages,
  listDummyAssistantThreads,
  previewDummySpeech,
  sendDummyAssistantTurn,
  synthesizeDummySpeech,
  transcribeDummyVoice,
  updateDummyAssistantMemoryPreferences,
  updateDummyAssistantPreferences,
} from "./assistant-dummy";

jest.mock("@/config/app-variant", () => ({
  isDevelopmentAppVariant: () => true,
}));

describe("assistant dummy service", () => {
  it("identifies dummy tokens in development variant", () => {
    expect(isDummyAssistantToken("dummy-dev-access-token")).toBe(true);
    expect(isDummyAssistantToken("real-jwt-token")).toBe(false);
  });

  it("provides and updates assistant preferences", async () => {
    const initial = await getDummyAssistantPreferences();
    expect(initial.assistantName).toBe("Nova");
    expect(initial.userPreferredName).toBe("Don");

    const updated = await updateDummyAssistantPreferences({
      assistantName: "Sage",
      userPreferredName: "Don",
    });
    expect(updated.assistantName).toBe("Sage");
  });

  it("provides and updates memory preferences", async () => {
    const initial = await getDummyAssistantMemoryPreferences();
    expect(initial.debtStrategy).toBe("avalanche");

    const updated = await updateDummyAssistantMemoryPreferences({
      debtStrategy: "snowball",
    });
    expect(updated.debtStrategy).toBe("snowball");
  });

  it("lists, clears, and reads memories", async () => {
    const memories = await getDummyAssistantMemory();
    expect(memories.length).toBeGreaterThan(0);

    await clearDummyAssistantMemory();
    const cleared = await getDummyAssistantMemory();
    expect(cleared).toHaveLength(0);
  });

  it("handles threads, turns, and messages", async () => {
    const threads = await listDummyAssistantThreads();
    expect(threads.items.length).toBeGreaterThan(0);

    const firstThread = threads.items[0]!;
    const messages = await listDummyAssistantMessages(firstThread.id);
    expect(messages.items.length).toBeGreaterThan(0);

    const turn = await createDummyAssistantThreadTurn({
      message: "What is my budget for groceries?",
      clientRequestId: "00000000-0000-4000-8000-000000000010",
      kind: "text",
    });
    expect(turn.thread.id).toBeDefined();
    expect(turn.assistantMessage.content).toContain("Groceries");

    const followUp = await sendDummyAssistantTurn(turn.thread.id, {
      message: "What about my debts?",
      clientRequestId: "00000000-0000-4000-8000-000000000011",
    });
    expect(followUp.assistantMessage.content).toContain("Citibank");

    await deleteDummyAssistantThread(turn.thread.id);
    const afterDelete = await listDummyAssistantThreads();
    expect(afterDelete.items.find((t) => t.id === turn.thread.id)).toBeUndefined();
  });

  it("provides voice preferences, transcription, and speech synthesis", async () => {
    const voicePrefs = await getDummyAssistantVoicePreferences();
    expect(voicePrefs.enabled).toBe(true);
    expect(voicePrefs.speechAvailable).toBe(true);

    const granted = await grantDummyAssistantVoiceConsent();
    expect(granted.consentedAt).toBeDefined();

    const transcription = await transcribeDummyVoice({
      uri: "file://test.m4a",
      mimeType: "audio/mp4",
      fileName: "test.m4a",
    });
    expect(transcription.text).toBeTruthy();

    const speech = await synthesizeDummySpeech("msg-1", "bright");
    expect(speech.bytes.byteLength).toBeGreaterThan(0);
    expect(speech.mimeType).toBe("audio/mpeg");

    const preview = await previewDummySpeech("default");
    expect(preview.bytes.byteLength).toBeGreaterThan(0);
  });

  it("provides mock receipts and voice transactions", async () => {
    const receiptPrefs = await getDummyReceiptPreferences();
    expect(receiptPrefs.enabled).toBe(true);

    const receipt = await extractDummyReceipt();
    expect(receipt.merchant).toBe("Metro Supermarket");
    expect(receipt.amountMinor).toBe(245000);

    const voiceDraft = await extractDummyVoiceTransaction();
    expect(voiceDraft.amountMinor).toBe(25000);
    expect(voiceDraft.categoryName).toBe("Dining & Food");
  });
});
