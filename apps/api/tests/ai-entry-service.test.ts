import { CURRENT_RECEIPT_CONSENT_VERSION, type ImportPreview } from "@zoption/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createAiEntryService } from "../src/entry/ai-entry-service";
import type { ImportRepository } from "../src/db/imports";
import type { ReceiptRepository } from "../src/db/receipts";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = "tenant-id";

const { binding, database } = createD1TestDatabase();
database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
afterAll(() => database.close());

function poolCount(): number {
  const row = database
    .prepare("SELECT count FROM billing_monthly_usage WHERE tenant_id = ? AND feature = 'ai_usage'")
    .get(TENANT_ID) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

const preview: ImportPreview = {
  token: "c5ef5a13-3d62-4a41-8bb7-c30d6bd839b0",
  expiresAt: "2026-08-20T15:15:00.000Z",
  fileName: "statement.pdf",
  rowCount: 1,
  acceptedCount: 1,
  rejectedCount: 0,
  duplicateCount: 0,
  rows: [],
};

function repository(consented = true): ReceiptRepository {
  return {
    getConsent: vi.fn(async () => ({
      consentedAt: consented ? "2026-08-20T00:00:00.000Z" : null,
      consentVersion: consented ? CURRENT_RECEIPT_CONSENT_VERSION : 0,
    })),
    grantConsent: vi.fn(),
  };
}

function imports(): ImportRepository {
  return { preview: vi.fn(async () => preview), commit: vi.fn() };
}

function env(run: ReturnType<typeof vi.fn>, toMarkdown: ReturnType<typeof vi.fn>): Bindings {
  const bindings = {} as Bindings;
  Object.assign(bindings, {
    DB: binding,
    RECEIPT_ENTRY_ENABLED: "true",
    ASSISTANT_TIME_ZONE: "Asia/Manila",
    AI: { run, toMarkdown },
  });
  return bindings;
}

/** A tenant whose shared pool is already at 500 units. */
function cappedEnv(run: ReturnType<typeof vi.fn>, toMarkdown: ReturnType<typeof vi.fn>): Bindings {
  const capped = createD1TestDatabase();
  capped.database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')")
    .run(TENANT_ID);
  capped.database
    .prepare(
      "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, date('now','+8 hours','start of month'), 'ai_usage', 500, 500)",
    )
    .run(TENANT_ID);
  const bindings = {} as Bindings;
  Object.assign(bindings, {
    DB: capped.binding,
    RECEIPT_ENTRY_ENABLED: "true",
    ASSISTANT_TIME_ZONE: "Asia/Manila",
    AI: { run, toMarkdown },
  });
  return bindings;
}

describe("AI entry service", () => {
  it("refuses pooled AI entry at the cap before any provider call", async () => {
    const run = vi.fn();
    const toMarkdown = vi.fn();
    const service = createAiEntryService(repository(), imports());

    await expect(
      service.extractVoiceTranscript(cappedEnv(run, toMarkdown), TENANT_ID, "Spent 250 pesos"),
    ).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      message: "You have reached your AI usage limit for this month.",
      details: { feature: "ai_usage", used: 500, limit: 500 },
    });
    await expect(
      service.previewPdf(
        cappedEnv(run, toMarkdown),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toMatchObject({ status: 409, code: "monthly_limit_reached" });
    expect(run).not.toHaveBeenCalled();
    expect(toMarkdown).not.toHaveBeenCalled();
  });

  it("draws one unit for the transcript mode and one for the audio mode", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "@cf/openai/whisper-large-v3-turbo") {
        return { text: "Spent 250 pesos on lunch today" };
      }
      return {
        response: {
          draft: { description: "Lunch", amountPhp: "250.00", kind: "expense" },
        },
      };
    });
    const service = createAiEntryService(repository(), imports());
    const before = poolCount();

    await service.extractVoiceTranscript(env(run, vi.fn()), TENANT_ID, "Spent 250 pesos on lunch");
    await service.extractVoice(
      env(run, vi.fn()),
      TENANT_ID,
      new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
    );

    expect(poolCount()).toBe(before + 2);
  });

  it("converts a PDF in-flight then delegates its rows to the existing import preview", async () => {
    const run = vi.fn(async () => ({
      response: {
        rows: [
          {
            date: "08/20/2026",
            description: "Groceries",
            amountMinor: -125_050,
            kind: "expense",
          },
        ],
      },
    }));
    const toMarkdown = vi.fn(async () => ({
      id: "converted",
      name: "statement.pdf",
      mimeType: "application/pdf",
      format: "text" as const,
      tokens: 42,
      data: "08/20/2026 GROCERIES 1,250.50",
    }));
    const previewImport = vi.fn<ImportRepository["preview"]>(async () => preview);
    const importRepository: ImportRepository = { preview: previewImport, commit: vi.fn() };
    const service = createAiEntryService(repository(), importRepository);

    await expect(
      service.previewPdf(
        env(run, toMarkdown),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toEqual(preview);

    expect(toMarkdown).toHaveBeenCalledOnce();
    expect(previewImport).toHaveBeenCalledOnce();
    const previewRequest = previewImport.mock.calls[0]?.[2];
    expect(previewRequest?.fileName).toBe("statement.pdf");
    expect(previewRequest?.csvText).toContain('"2026-08-20","Groceries","-1250.50","expense"');
  });

  it("returns a review-only draft from voice and does not need a transaction repository", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "@cf/openai/whisper-large-v3-turbo") {
        return { text: "Spent 250 pesos on lunch today" };
      }
      return {
        response: {
          draft: {
            description: "Lunch",
            amountPhp: "250.00",
            kind: "expense",
            categoryName: "Food",
          },
        },
      };
    });
    const service = createAiEntryService(repository(), imports());

    await expect(
      service.extractVoice(
        env(run, vi.fn()),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
      ),
    ).resolves.toMatchObject({
      transcript: "Spent 250 pesos on lunch today",
      description: "Lunch",
      amountMinor: 25_000,
      kind: "expense",
    });
  });

  it("converts comma-separated spoken pesos to centavos before returning the shared draft", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "@cf/openai/whisper-large-v3-turbo") {
        return { text: "I have spent 1,000 today for snacks" };
      }
      return {
        response: {
          draft: {
            description: "Snacks",
            amountPhp: "1000.00",
            kind: "expense",
          },
        },
      };
    });
    const service = createAiEntryService(repository(), imports());

    await expect(
      service.extractVoice(
        env(run, vi.fn()),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
      ),
    ).resolves.toMatchObject({ amountMinor: 100_000, description: "Snacks" });
  });

  it("rejects a model amount that disagrees with the clear numeric transcript", async () => {
    const run = vi.fn(async (model: string) => {
      if (model === "@cf/openai/whisper-large-v3-turbo") {
        return { text: "I have spent 1,000 today for snacks" };
      }
      return {
        response: {
          draft: { description: "Snacks", amountPhp: "10.00", kind: "expense" },
        },
      };
    });
    const service = createAiEntryService(repository(), imports());

    await expect(
      service.extractVoice(
        env(run, vi.fn()),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
      ),
    ).rejects.toMatchObject({ status: 422, code: "voice_transaction_amount_mismatch" });
  });

  it("extracts a draft directly from a transcript without calling transcription provider", async () => {
    const run = vi.fn(async () => ({
      response: {
        draft: {
          description: "Shoes",
          amountPhp: "2000.00",
          kind: "expense",
          categoryName: "Shopping",
        },
      },
    }));
    const service = createAiEntryService(repository(), imports());

    await expect(
      service.extractVoiceTranscript(env(run, vi.fn()), TENANT_ID, "Spent 2k on shoes today"),
    ).resolves.toMatchObject({
      transcript: "Spent 2k on shoes today",
      description: "Shoes",
      amountMinor: 200_000,
      kind: "expense",
      categoryName: "Shopping",
    });

    expect(run).toHaveBeenCalledOnce();
  });

  it("includes user categories in prompt and matches category to active user categories", async () => {
    const run = vi.fn(async () => ({
      response: {
        draft: {
          description: "Weekly groceries at SM",
          amountPhp: "1500.00",
          kind: "expense",
          categoryName: "Groceries",
        },
      },
    }));
    const service = createAiEntryService(repository(), imports());

    const result = await service.extractVoiceTranscript(
      env(run, vi.fn()),
      TENANT_ID,
      "Spent 1500 on groceries today",
      ["Food & dining", "Transport", "Utilities"],
    );

    expect(result).toMatchObject({
      transcript: "Spent 1500 on groceries today",
      description: "Weekly groceries at SM",
      amountMinor: 150_000,
      kind: "expense",
      categoryName: "Food & dining",
    });

    const firstCall = run.mock.calls[0] as unknown as [
      string,
      { messages: Array<{ role: string; content: string }> },
    ];
    const userPrompt = firstCall[1].messages.find((m) => m.role === "user")?.content ?? "";
    expect(userPrompt).toContain("Available user categories: Food & dining, Transport, Utilities");
  });

  it("does not send a PDF to AI without current AI-entry consent", async () => {
    const run = vi.fn();
    const toMarkdown = vi.fn();
    const service = createAiEntryService(repository(false), imports());

    await expect(
      service.previewPdf(
        env(run, toMarkdown),
        TENANT_ID,
        new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toMatchObject({ status: 409, code: "entry_consent_required" });
    expect(toMarkdown).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("extracts Tagalog voice transaction and forwards language option to transcription provider", async () => {
    const mockTranscribe = vi.fn(async () => ({
      text: "Naglipat ako ng 500 pesos sa Maya kanina",
      durationSeconds: 3,
    }));
    const run = vi.fn(async () => ({
      response: {
        draft: {
          description: "Transfer to Maya",
          amountPhp: "500.00",
          kind: "transfer",
          categoryName: "Transfer",
        },
      },
    }));
    const customTranscriptionProvider = {
      transcribe: mockTranscribe,
    };
    const service = createAiEntryService(repository(), imports(), customTranscriptionProvider);

    const result = await service.extractVoice(
      env(run, vi.fn()),
      TENANT_ID,
      new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
      ["Transfer", "Food & dining"],
      "fil",
    );

    expect(result).toMatchObject({
      transcript: "Naglipat ako ng 500 pesos sa Maya kanina",
      amountMinor: 50_000,
      kind: "transfer",
    });
    expect(mockTranscribe).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      language: "fil",
    });
  });
});
