import { CURRENT_RECEIPT_CONSENT_VERSION, type ImportPreview } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import { createAiEntryService } from "../src/entry/ai-entry-service";
import type { ImportRepository } from "../src/db/imports";
import type { ReceiptRepository } from "../src/db/receipts";
import type { Bindings } from "../src/types";

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
    DB: {} as D1Database,
    RECEIPT_ENTRY_ENABLED: "true",
    ASSISTANT_TIME_ZONE: "Asia/Manila",
    AI: { run, toMarkdown },
  });
  return bindings;
}

describe("AI entry service", () => {
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
    const importRepository = imports();
    const service = createAiEntryService(repository(), importRepository);

    await expect(
      service.previewPdf(
        env(run, toMarkdown),
        "tenant-id",
        new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toEqual(preview);

    expect(toMarkdown).toHaveBeenCalledOnce();
    expect(importRepository.preview).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-id",
      expect.objectContaining({
        fileName: "statement.pdf",
        csvText: expect.stringContaining('"2026-08-20","Groceries","-1250.50","expense"'),
      }),
    );
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
            amountMinor: 25_000,
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
        "tenant-id",
        new File([new Uint8Array([1, 2, 3])], "voice.m4a", { type: "audio/mp4" }),
      ),
    ).resolves.toMatchObject({
      transcript: "Spent 250 pesos on lunch today",
      description: "Lunch",
      amountMinor: 25_000,
      kind: "expense",
    });
  });

  it("does not send a PDF to AI without current AI-entry consent", async () => {
    const run = vi.fn();
    const toMarkdown = vi.fn();
    const service = createAiEntryService(repository(false), imports());

    await expect(
      service.previewPdf(
        env(run, toMarkdown),
        "tenant-id",
        new File([new Uint8Array([1, 2, 3])], "statement.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toMatchObject({ status: 409, code: "entry_consent_required" });
    expect(toMarkdown).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
