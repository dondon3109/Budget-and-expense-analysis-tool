import type { AssistantTurnResult } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { AssistantService, AssistantTurnExecution } from "../src/assistant/service";
import type { AssistantVoiceService } from "../src/assistant/voice-service";
import type { AiEntryService } from "../src/entry/ai-entry-service";
import type { ReceiptService } from "../src/receipts/service";
import { HttpError } from "../src/errors";
import { AUTHORIZATION, TENANT_ID, createAppWithFakes, privateHeaders } from "./helpers/app-fakes";

describe("API assistant, voice, and entry routes", () => {
  it("accepts bounded multipart recordings on the authenticated voice route", async () => {
    const transcribe = vi.fn(async () => ({
      text: "Review this transcript",
      durationSeconds: 2,
      languageCode: "en",
    }));
    const assistantVoiceService = { transcribe } as unknown as AssistantVoiceService;
    const app = createAppWithFakes({ assistantVoiceService });
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }));

    const response = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ text: "Review this transcript" });
    expect(transcribe).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File), "auto");

    const englishForm = new FormData();
    englishForm.set(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }),
    );
    englishForm.set("lang", "en");
    const englishResponse = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: englishForm,
    });
    expect(englishResponse.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File), "en");

    const tagalogForm = new FormData();
    tagalogForm.set(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }),
    );
    tagalogForm.set("lang", "fil");
    const tagalogResponse = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: AUTHORIZATION,
      body: tagalogForm,
    });
    expect(tagalogResponse.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File), "fil");
  });

  it("rejects JSON on the multipart voice transcription route", async () => {
    const transcribe = vi.fn();
    const assistantVoiceService = { transcribe } as unknown as AssistantVoiceService;
    const app = createAppWithFakes({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/transcriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ audio: "not-a-recording" }),
    });

    expect(response.status).toBe(415);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns spoken audio with the authenticated Preview origin headers", async () => {
    const synthesize = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const assistantVoiceService = { synthesize } as unknown as AssistantVoiceService;
    const app = createAppWithFakes({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/speech", {
      method: "POST",
      headers: privateHeaders({
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      }),
      body: JSON.stringify({
        messageId: "00000000-0000-4000-8000-000000000003",
        voice: "bright",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(synthesize).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "00000000-0000-4000-8000-000000000003",
      "bright",
    );
  });

  it("returns an authenticated curated voice preview", async () => {
    const preview = vi.fn(async () => new Response(new Uint8Array([4, 5, 6])));
    const assistantVoiceService = { preview } as unknown as AssistantVoiceService;
    const app = createAppWithFakes({ assistantVoiceService });
    const response = await app.request("/api/app/assistant/voice/preview", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ voice: "energetic" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
    expect(preview).toHaveBeenCalledWith(undefined, TENANT_ID, "energetic");
  });

  it("returns authenticated receipt preferences", async () => {
    const receiptService = {
      getPreferences: vi.fn(async () => ({
        enabled: true,
        consentedAt: null,
        consentVersion: 0,
        visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
      })),
    } as unknown as ReceiptService;
    const app = createAppWithFakes({ receiptService });
    const response = await app.request("/api/app/receipts/preferences", {
      headers: AUTHORIZATION,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ enabled: true, consentVersion: 0 });
    expect(receiptService.getPreferences).toHaveBeenCalledWith(undefined, TENANT_ID);
  });

  it("rejects an invalid receipt consent update", async () => {
    const grantConsent = vi.fn();
    const receiptService = { grantConsent } as unknown as ReceiptService;
    const app = createAppWithFakes({ receiptService });
    const response = await app.request("/api/app/receipts/preferences", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ consented: false }),
    });

    expect(response.status).toBe(400);
    expect(grantConsent).not.toHaveBeenCalled();
  });

  it("accepts a bounded multipart photo on the authenticated receipt route", async () => {
    const extract = vi.fn(async () => ({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: -28500,
      currency: "PHP",
      kind: "expense",
      categoryName: "Food & dining",
      rawText: "JOLLIBEE 285.00",
    }));
    const receiptService = { extract } as unknown as ReceiptService;
    const app = createAppWithFakes({ receiptService });
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" }));

    const response = await app.request("/api/app/receipts/extract", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      merchant: "Jollibee",
      amountMinor: -28500,
    });
    expect(extract).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File));
  });

  it("rejects JSON on the multipart receipt extraction route", async () => {
    const extract = vi.fn();
    const receiptService = { extract } as unknown as ReceiptService;
    const app = createAppWithFakes({ receiptService });
    const response = await app.request("/api/app/receipts/extract", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: "not-a-photo" }),
    });

    expect(response.status).toBe(415);
    expect(extract).not.toHaveBeenCalled();
  });

  it("keeps PDF statements on the authenticated preview path", async () => {
    const previewPdf = vi.fn(async () => ({
      token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
      expiresAt: "2026-08-20T15:15:00.000Z",
      fileName: "statement.pdf",
      rowCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      duplicateCount: 0,
      rows: [],
    }));
    const aiEntryService: AiEntryService = {
      previewPdf,
      extractVoice: vi.fn(),
      extractVoiceTranscript: vi.fn(),
      extractVoiceTranscriptEntries: vi.fn(),
    };
    const app = createAppWithFakes({ aiEntryService });
    const form = new FormData();
    form.set(
      "pdf",
      new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
    );

    const response = await app.request("/api/app/entry/pdf-preview", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"token"');
    expect(previewPdf).toHaveBeenCalledWith(undefined, TENANT_ID, expect.any(File));
  });

  it("returns a review-only voice transaction draft without creating a transaction", async () => {
    const extractVoice = vi.fn(async () => ({
      transcript: "Spent 250 pesos on lunch today",
      description: "Lunch",
      date: "2026-08-20",
      amountMinor: 25_000,
      currency: "PHP" as const,
      kind: "expense" as const,
    }));
    const extractVoiceTranscript = vi.fn(async () => ({
      transcript: "Spent 250 pesos on lunch today",
      description: "Lunch",
      date: "2026-08-20",
      amountMinor: 25_000,
      currency: "PHP" as const,
      kind: "expense" as const,
    }));
    const aiEntryService: AiEntryService = {
      previewPdf: vi.fn(),
      extractVoice,
      extractVoiceTranscript,
      extractVoiceTranscriptEntries: vi.fn(),
    };
    const app = createAppWithFakes({ aiEntryService });
    const form = new FormData();
    form.set("audio", new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }));

    const response = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      description: "Lunch",
      amountMinor: 25_000,
    });
    expect(extractVoice).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.any(File),
      undefined,
      "auto",
    );

    const englishAudioForm = new FormData();
    englishAudioForm.set(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "audio.webm", { type: "audio/webm" }),
    );
    englishAudioForm.set("lang", "en");
    const englishAudioResponse = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: AUTHORIZATION,
      body: englishAudioForm,
    });
    expect(englishAudioResponse.status).toBe(200);
    expect(extractVoice).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.any(File),
      undefined,
      "en",
    );

    const tagalogAudioForm = new FormData();
    tagalogAudioForm.set(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "audio.webm", { type: "audio/webm" }),
    );
    tagalogAudioForm.set("lang", "fil");
    const tagalogAudioResponse = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: AUTHORIZATION,
      body: tagalogAudioForm,
    });
    expect(tagalogAudioResponse.status).toBe(200);
    expect(extractVoice).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      expect.any(File),
      undefined,
      "fil",
    );

    const jsonResponse = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "Spent 250 pesos on lunch today" }),
    });

    expect(jsonResponse.status).toBe(200);
    await expect(jsonResponse.json()).resolves.toMatchObject({
      description: "Lunch",
      amountMinor: 25_000,
    });
    expect(extractVoiceTranscript).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "Spent 250 pesos on lunch today",
    );

    const jsonCategoriesResponse = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "Spent 250 pesos on lunch today",
        categories: ["Food & dining", "Transport"],
      }),
    });

    expect(jsonCategoriesResponse.status).toBe(200);
    expect(extractVoiceTranscript).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      "Spent 250 pesos on lunch today",
      ["Food & dining", "Transport"],
    );
  });

  it("returns several review-ready drafts for one spoken note", async () => {
    const drafts = [
      {
        transcript: "I spent 250 on Jollibee for lunch and 2,000 on groceries",
        description: "Jollibee lunch",
        date: "2026-08-20",
        amountMinor: 25_000,
        currency: "PHP" as const,
        kind: "expense" as const,
      },
      {
        transcript: "I spent 250 on Jollibee for lunch and 2,000 on groceries",
        description: "Groceries",
        date: "2026-08-20",
        amountMinor: 200_000,
        currency: "PHP" as const,
        kind: "expense" as const,
      },
    ];
    const extractVoiceTranscriptEntries = vi.fn(async () => drafts);
    const aiEntryService = {
      previewPdf: vi.fn(),
      extractVoice: vi.fn(),
      extractVoiceTranscript: vi.fn(),
      extractVoiceTranscriptEntries,
    } as unknown as AiEntryService;
    const app = createAppWithFakes({ aiEntryService });

    const response = await app.request("/api/app/entry/voice/entries", {
      method: "POST",
      headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: drafts[0]?.transcript,
        categories: ["Food & dining", "Groceries"],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ drafts });
    expect(extractVoiceTranscriptEntries).toHaveBeenCalledWith(
      undefined,
      TENANT_ID,
      drafts[0]?.transcript,
      ["Food & dining", "Groceries"],
    );

    const missing = await app.request("/api/app/entry/voice/entries", {
      method: "POST",
      headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
  });

  it("rejects an over-long voice transcript before the provider request", async () => {
    const extractVoiceTranscript = vi.fn();
    const aiEntryService = {
      previewPdf: vi.fn(),
      extractVoice: vi.fn(),
      extractVoiceTranscript,
    } as unknown as AiEntryService;
    const app = createAppWithFakes({ aiEntryService });

    const response = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: { ...AUTHORIZATION, "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "a".repeat(2_001) }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
    expect(extractVoiceTranscript).not.toHaveBeenCalled();
  });

  it("rejects an over-long multipart voice transcript before the provider request", async () => {
    const extractVoice = vi.fn();
    const extractVoiceTranscript = vi.fn();
    const aiEntryService = {
      previewPdf: vi.fn(),
      extractVoice,
      extractVoiceTranscript,
    } as unknown as AiEntryService;
    const app = createAppWithFakes({ aiEntryService });
    const form = new FormData();
    form.set("transcript", "a".repeat(2_001));

    const response = await app.request("/api/app/entry/voice", {
      method: "POST",
      headers: AUTHORIZATION,
      body: form,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
    expect(extractVoiceTranscript).not.toHaveBeenCalled();
    expect(extractVoice).not.toHaveBeenCalled();
  });

  it.each([
    ["new thread", "/api/app/assistant/threads", 201],
    [
      "existing thread",
      "/api/app/assistant/threads/00000000-0000-4000-8000-000000000001/messages",
      200,
    ],
  ])(
    "forwards Cloudflare waitUntil for an assistant turn in a %s",
    async (_label, path, status) => {
      const result: AssistantTurnResult = {
        thread: {
          id: "00000000-0000-4000-8000-000000000001",
          title: "Assistant test",
          kind: "text",
          lastMessageAt: "2026-08-10T00:00:01.000Z",
          createdAt: "2026-08-10T00:00:00.000Z",
        },
        userMessage: {
          id: "00000000-0000-4000-8000-000000000002",
          threadId: "00000000-0000-4000-8000-000000000001",
          role: "user",
          content: "Test message",
          status: "completed",
          createdAt: "2026-08-10T00:00:00.000Z",
        },
        assistantMessage: {
          id: "00000000-0000-4000-8000-000000000003",
          threadId: "00000000-0000-4000-8000-000000000001",
          role: "assistant",
          content: "Test answer",
          status: "completed",
          createdAt: "2026-08-10T00:00:01.000Z",
        },
      };
      const completeTurn = vi.fn(async (...args: unknown[]) => {
        const execution = args.at(-1) as AssistantTurnExecution | undefined;
        execution?.defer(Promise.resolve());
        return result;
      });
      const assistantService = {
        createThreadTurn: completeTurn,
        sendTurn: completeTurn,
      } as unknown as AssistantService;
      const app = createAppWithFakes({ assistantService });
      const waitUntil = vi.fn(() => undefined);
      const executionContext = { waitUntil } as unknown as ExecutionContext;

      const response = await app.request(
        path,
        {
          method: "POST",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: "Test message",
            clientRequestId: "00000000-0000-4000-8000-000000000004",
          }),
        },
        { DB: {} as D1Database, ASSISTANT_ENABLED: "true" },
        executionContext,
      );

      expect(response.status).toBe(status);
      expect(completeTurn).toHaveBeenCalledOnce();
      expect(waitUntil).toHaveBeenCalledOnce();
      expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    },
  );

  describe("assistant memory routes", () => {
    const assistantEnv = { DB: {} as D1Database, ASSISTANT_ENABLED: "true" };
    const memoryId = "11111111-1111-4111-8111-111111111111";
    const memory = {
      id: memoryId,
      kind: "fact" as const,
      key: "monthly_budget_cap",
      value: "Monthly budget PHP 30,000",
      source: "deterministic" as const,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };

    it("updates a remembered fact for the authenticated tenant", async () => {
      const updateMemory = vi.fn(async () => memory);
      const app = createAppWithFakes({
        assistantService: { updateMemory } as unknown as AssistantService,
      });

      const response = await app.request(
        `/api/app/assistant/memory/${memoryId}`,
        {
          method: "PATCH",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ value: memory.value }),
        },
        assistantEnv,
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(memory);
      expect(updateMemory).toHaveBeenCalledWith(assistantEnv, TENANT_ID, memoryId, memory.value);
    });

    it("rejects an invalid memory id or blank value before reaching the service", async () => {
      const updateMemory = vi.fn(async () => memory);
      const app = createAppWithFakes({
        assistantService: { updateMemory } as unknown as AssistantService,
      });

      const invalidId = await app.request(
        "/api/app/assistant/memory/not-a-uuid",
        {
          method: "PATCH",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ value: memory.value }),
        },
        assistantEnv,
      );
      expect(invalidId.status).toBe(400);

      const blankValue = await app.request(
        `/api/app/assistant/memory/${memoryId}`,
        {
          method: "PATCH",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ value: "   " }),
        },
        assistantEnv,
      );
      expect(blankValue.status).toBe(400);

      expect(updateMemory).not.toHaveBeenCalled();
    });

    it("maps a missing memory to 404 and deletes for the authenticated tenant", async () => {
      const updateMemory = vi.fn(async () => {
        throw new HttpError(404, "memory_not_found", "That memory was not found.");
      });
      const deleteMemoryFact = vi.fn(async () => undefined);
      const app = createAppWithFakes({
        assistantService: { updateMemory, deleteMemoryFact } as unknown as AssistantService,
      });

      const missing = await app.request(
        `/api/app/assistant/memory/${memoryId}`,
        {
          method: "PATCH",
          headers: privateHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ value: memory.value }),
        },
        assistantEnv,
      );
      expect(missing.status).toBe(404);

      const deleted = await app.request(
        `/api/app/assistant/memory/${memoryId}`,
        { method: "DELETE", headers: AUTHORIZATION },
        assistantEnv,
      );
      expect(deleted.status).toBe(204);
      expect(deleteMemoryFact).toHaveBeenCalledWith(assistantEnv, TENANT_ID, memoryId);
    });
  });
});
