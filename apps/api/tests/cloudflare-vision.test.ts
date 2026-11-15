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
          items: [
            { description: " Chickenjoy ", amountMinor: 18500, categoryName: " Food " },
            { description: " Peach mango pie ", amountMinor: 10000 },
          ],
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
      max_tokens: 2048,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema" },
    });
    const [message] = call[1].messages as Array<{
      role: string;
      content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
    expect(message?.role).toBe("user");
    const prompt = message?.content.find((part) => part.type === "text")?.text ?? "";
    expect(message?.content.find((part) => part.type === "image_url")?.image_url?.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(prompt).toContain("merchant");
    expect(prompt).toContain("discount");
    expect(prompt).toContain("GCash");
    expect(prompt).toContain("referenceNo");
    expect(call[2].signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: 28500,
      kind: "expense",
      categoryName: "Food",
      items: [
        { description: "Chickenjoy", amountMinor: 18500, categoryName: "Food" },
        { description: "Peach mango pie", amountMinor: 10000, categoryName: undefined },
      ],
      rawText: "JOLLIBEE TOTAL 285.00",
    });
  });

  it("fails safely when the AI binding is missing", async () => {
    await expect(
      cloudflareVisionProvider.extract({ DB: {} as D1Database }, receiptImage()),
    ).rejects.toMatchObject({ provider: "cloudflare_workers_ai", kind: "configuration" });
  });

  it("extracts a candidate when the model returns the JSON object directly", async () => {
    const run = vi.fn(async () => ({
      response: {
        merchant: "Jollibee",
        date: "2026-08-16",
        amountMinor: 35300,
        kind: "expense",
        categoryName: "Food",
        items: [{ description: "Burger steak", amountMinor: 35300, categoryName: "Food" }],
        rawText: "JOLLIBEE TOTAL 353.00",
      },
    }));

    const result = await cloudflareVisionProvider.extract(environment(run), receiptImage());

    expect(result).toEqual({
      merchant: "Jollibee",
      date: "2026-08-16",
      amountMinor: 35300,
      kind: "expense",
      categoryName: "Food",
      items: [{ description: "Burger steak", amountMinor: 35300, categoryName: "Food" }],
      rawText: "JOLLIBEE TOTAL 353.00",
    });
  });

  it("reads a chat-completion answer with GCash confirmation details", async () => {
    const run = vi.fn(async () => ({
      id: "chatcmpl-1",
      object: "chat.completion",
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({
              merchant: "JA•••N M•• L.",
              date: "2026-09-30",
              amountMinor: 240000,
              kind: "expense",
              categoryName: null,
              items: [],
              payment: {
                provider: "GCash",
                type: "send_money",
                counterparty: "JA•••N M•• L.",
                referenceNo: "2045 596 729825",
                feeMinor: 0,
                sentAmountMinor: null,
                sentCurrency: null,
                exchangeRate: null,
              },
              rawText: "Sent via GCash Amount 2,400.00 Ref No. 2045 596 729825",
            }),
          },
        },
      ],
    }));

    const result = await cloudflareVisionProvider.extract(environment(run), receiptImage());

    expect(result).toEqual({
      merchant: "JA•••N M•• L.",
      date: "2026-09-30",
      amountMinor: 240000,
      kind: "expense",
      items: [],
      payment: {
        provider: "GCash",
        type: "send_money",
        counterparty: "JA•••N M•• L.",
        referenceNo: "2045 596 729825",
        feeMinor: 0,
      },
      rawText: "Sent via GCash Amount 2,400.00 Ref No. 2045 596 729825",
    });
  });

  it("keeps a numeric exchange rate as text", async () => {
    const run = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              merchant: "Western Union",
              amountMinor: 2806000,
              payment: {
                provider: "Western Union",
                type: "remittance",
                sentAmountMinor: 50000,
                sentCurrency: "usd",
                exchangeRate: 56.12,
              },
            }),
          },
        },
      ],
    }));

    const result = await cloudflareVisionProvider.extract(environment(run), receiptImage());

    expect(result.payment).toMatchObject({
      sentAmountMinor: 50000,
      sentCurrency: "USD",
      exchangeRate: "56.12",
    });
  });

  it("recovers the JSON candidate from prose around it", async () => {
    const run = vi.fn(async () => ({
      response:
        "Here is the receipt information:\n" +
        JSON.stringify({ merchant: "Jollibee", amountMinor: 28500 }) +
        "\nI hope that helps.",
    }));

    const result = await cloudflareVisionProvider.extract(environment(run), receiptImage());

    expect(result).toEqual({
      merchant: "Jollibee",
      amountMinor: 28500,
    });
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
