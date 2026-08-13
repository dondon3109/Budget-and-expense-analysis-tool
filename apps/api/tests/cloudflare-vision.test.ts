import { describe, expect, it, vi } from "vitest";

import { cloudflareVisionProvider } from "../src/receipts/cloudflare-vision";
import { DEFAULT_RECEIPT_VISION_MODEL } from "../src/receipts/vision-provider";
import type { Bindings } from "../src/types";

const FENCE = String.fromCharCode(96, 96, 96);

function environment(run: ReturnType<typeof vi.fn>): Bindings {
  return {
    DB: {} as D1Database,
    AI: { run } as unknown as Ai,
    RECEIPT_VISION_PROVIDER_TIMEOUT_MS: "30000",
  };
}

const receiptImage = () =>
  new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" });

describe("Cloudflare vision provider", () => {
  it("extracts a candidate from a JSON-fenced response", async () => {
    const run = vi.fn(async () => ({
      response:
        FENCE +
        "json\n" +
        JSON.stringify({
          merchant: " Jollibee ",
          date: "2026-08-13",
          amountMinor: 28500,
          kind: "expense",
          categoryName: " Food ",
          rawText: "JOLLIBEE TOTAL 285.00",
        }) +
        "\n" +
        FENCE,
    }));

    const result = await cloudflareVisionProvider.extract(environment(run), receiptImage());

    const call = run.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      { signal: unknown },
    ];
    expect(call[0]).toBe(DEFAULT_RECEIPT_VISION_MODEL);
    expect(call[1]).toMatchObject({
      image: [expect.any(String)],
      max_tokens: 512,
    });
    expect(String(call[1].prompt)).toContain("merchant");
    expect(call[2].signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: 28500,
      kind: "expense",
      categoryName: "Food",
      rawText: "JOLLIBEE TOTAL 285.00",
    });
  });

  it("fails safely when the AI binding is missing", async () => {
    await expect(
      cloudflareVisionProvider.extract({ DB: {} as D1Database }, receiptImage()),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "configuration" });
  });

  it("rejects a response without a usable JSON candidate", async () => {
    const run = vi.fn(async () => ({ response: "Sorry, I could not read this." }));
    await expect(
      cloudflareVisionProvider.extract(environment(run), receiptImage()),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "invalid_response" });
  });

  it("rejects a malformed provider payload", async () => {
    const run = vi.fn(async () => ({ text: "unexpected shape" }));
    await expect(
      cloudflareVisionProvider.extract(environment(run), receiptImage()),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "invalid_response" });
  });
});
