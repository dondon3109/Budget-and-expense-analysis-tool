import { CURRENT_RECEIPT_CONSENT_VERSION } from "@zoption/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createReceiptService } from "../src/receipts/service";
import {
  ReceiptVisionProviderError,
  type ReceiptVisionProvider,
} from "../src/receipts/vision-provider";
import type { ReceiptRepository } from "../src/db/receipts";
import type { Bindings } from "../src/types";
import { createD1TestDatabase } from "./helpers/d1-test-harness";

const TENANT_ID = "tenant-id";

const { binding, database } = createD1TestDatabase();
database.prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')").run(TENANT_ID);
afterAll(() => database.close());

const env = {
  DB: binding,
  RECEIPT_ENTRY_ENABLED: "true",
} satisfies Bindings;

function poolRow() {
  return database
    .prepare(
      "SELECT count, allowance FROM billing_monthly_usage WHERE tenant_id = ? AND feature = 'ai_usage'",
    )
    .get(TENANT_ID) as { count: number; allowance: number };
}

/** A tenant whose shared pool is already at `used` units. */
function cappedEnvironment(used: number): Bindings {
  const capped = createD1TestDatabase();
  capped.database
    .prepare("INSERT INTO tenants (id, kind, name) VALUES (?, 'user', 'One')")
    .run(TENANT_ID);
  capped.database
    .prepare(
      "INSERT INTO billing_monthly_usage (tenant_id, month, feature, count, allowance) VALUES (?, date('now','+8 hours','start of month'), 'ai_usage', ?, 500)",
    )
    .run(TENANT_ID, used);
  return { DB: capped.binding, RECEIPT_ENTRY_ENABLED: "true" } satisfies Bindings;
}

const receiptImage = () =>
  new File([new Uint8Array([1, 2, 3])], "receipt.jpg", { type: "image/jpeg" });

function repository(consented = true): ReceiptRepository {
  return {
    getConsent: vi.fn(async () => ({
      consentedAt: consented ? "2026-08-12T00:00:00.000Z" : null,
      consentVersion: consented ? CURRENT_RECEIPT_CONSENT_VERSION : 0,
    })),
    grantConsent: vi.fn(async () => ({
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
    })),
  };
}

function provider(): ReceiptVisionProvider {
  return {
    extract: vi.fn(async () => ({
      merchant: "Jollibee",
      date: "08/13/2026",
      amountMinor: -28500,
      kind: "expense" as const,
      categoryName: "Food & dining",
      items: [
        { description: "Chickenjoy", amountMinor: 18500, categoryName: "Food & dining" },
        { description: "Peach mango pie", amountMinor: 10000, categoryName: "Food & dining" },
      ],
      rawText: "JOLLIBEE 285.00",
    })),
  };
}

describe("receipt service", () => {
  it("advertises the configured vision model and consent state", async () => {
    const service = createReceiptService(repository(), provider());
    await expect(service.getPreferences(env, TENANT_ID)).resolves.toMatchObject({
      enabled: true,
      consentedAt: "2026-08-12T00:00:00.000Z",
      consentVersion: CURRENT_RECEIPT_CONSENT_VERSION,
      visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
    });
  });

  it("requires receipt consent before a photo leaves Zoption", async () => {
    const vision = provider();
    const service = createReceiptService(repository(false), vision);
    const request = service.extract(env, TENANT_ID, receiptImage());
    await expect(request).rejects.toMatchObject({ status: 409, code: "receipt_consent_required" });
    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("draws one unit from the shared pool before the photo leaves Zoption", async () => {
    const vision = provider();
    const service = createReceiptService(repository(), vision);
    const before = poolRow()?.count ?? 0;

    await service.extract(env, TENANT_ID, receiptImage());

    expect(poolRow().count).toBe(before + 1);
    expect(vision.extract).toHaveBeenCalledOnce();
  });

  it("refuses at the pool cap before the photo leaves Zoption", async () => {
    const vision = provider();
    const service = createReceiptService(repository(), vision);

    await expect(
      service.extract(cappedEnvironment(500), TENANT_ID, receiptImage()),
    ).rejects.toMatchObject({
      status: 409,
      code: "monthly_limit_reached",
      message: "You have reached your AI usage limit for this month.",
      details: { feature: "ai_usage", used: 500, limit: 500 },
    });
    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("normalizes provider output into a PHP draft", async () => {
    const service = createReceiptService(repository(), provider());
    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toEqual({
      merchant: "Jollibee",
      date: "2026-08-13",
      amountMinor: -28500,
      currency: "PHP",
      kind: "expense",
      categoryName: "Food & dining",
      items: [
        { description: "Chickenjoy", amountMinor: 18500, categoryName: "Food & dining" },
        { description: "Peach mango pie", amountMinor: 10000, categoryName: "Food & dining" },
      ],
      rawText: "JOLLIBEE 285.00",
    });
  });

  it("defaults the kind from the amount sign and the date to today", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: " Market ",
      amountMinor: 1200,
    });
    const service = createReceiptService(repository(), vision);
    const draft = await service.extract(env, TENANT_ID, receiptImage());
    expect(draft.merchant).toBe("Market");
    expect(draft.kind).toBe("income");
    expect(draft.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.rawText).toBe("");
  });

  it("keeps each usable line item and omits malformed model lines", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "Market",
      amountMinor: 24500,
      kind: "expense",
      items: [
        { description: "Vegetables", amountMinor: 12000, categoryName: "Groceries" },
        { description: "Fish", amountMinor: -12500 },
        { description: "", amountMinor: 100 },
        { description: "Ignored", amountMinor: 0 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toMatchObject({
      items: [
        { description: "Vegetables", amountMinor: 12000, categoryName: "Groceries" },
        { description: "Fish", amountMinor: 12500 },
      ],
    });
  });

  it("drops total, VAT summary, and payment lines the model lists as items", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "SM Supermarket",
      amountMinor: 33_500,
      kind: "expense",
      items: [
        { description: "Rice 5kg", amountMinor: 30_000 },
        { description: "GCash cash-in fee", amountMinor: 3_500 },
        { description: "Subtotal", amountMinor: 33_500 },
        { description: "VATable Sales", amountMinor: 29_911 },
        { description: "VAT-Exempt Sales", amountMinor: 0 },
        { description: "VAT Amount", amountMinor: 3_589 },
        { description: "TOTAL", amountMinor: 33_500 },
        { description: "Cash", amountMinor: 50_000 },
        { description: "Change", amountMinor: 16_500 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toMatchObject({
      items: [
        { description: "Rice 5kg", amountMinor: 30_000 },
        { description: "GCash cash-in fee", amountMinor: 3_500 },
      ],
    });
  });

  it("rescales line items the model wrote in pesos when they reconcile exactly", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "Jollibee",
      amountMinor: 28_500,
      kind: "expense",
      items: [
        { description: "Chickenjoy", amountMinor: 185 },
        { description: "Peach mango pie", amountMinor: 100 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toMatchObject({
      items: [
        { description: "Chickenjoy", amountMinor: 18_500 },
        { description: "Peach mango pie", amountMinor: 10_000 },
      ],
    });
  });

  it("nets a single-line discount into the purchased item", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "Market",
      amountMinor: 24_500,
      kind: "expense",
      items: [
        { description: "Vegetables", amountMinor: 25_000, categoryName: "Groceries" },
        { description: "Member discount", amountMinor: -500 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toMatchObject({
      amountMinor: 24_500,
      items: [{ description: "Vegetables", amountMinor: 24_500, categoryName: "Groceries" }],
    });
  });

  it("spreads discounts across items by price so every centavo reconciles", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "Jollibee",
      amountMinor: -34_000,
      kind: "expense",
      items: [
        { description: "Chickenjoy bucket", amountMinor: 25_000 },
        { description: "Spaghetti", amountMinor: 10_000 },
        { description: "SC Disc 20%", amountMinor: -600 },
        { description: "Less VAT", amountMinor: -400 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    const draft = await service.extract(env, TENANT_ID, receiptImage());
    expect(draft.items).toEqual([
      { description: "Chickenjoy bucket", amountMinor: 24_286 },
      { description: "Spaghetti", amountMinor: 9_714 },
    ]);
  });

  it("falls back to the receipt total when the discount covers every item", async () => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "Market",
      amountMinor: 100,
      kind: "expense",
      items: [
        { description: "Sample", amountMinor: 500 },
        { description: "Voucher", amountMinor: -500 },
      ],
    });
    const service = createReceiptService(repository(), vision);

    await expect(service.extract(env, TENANT_ID, receiptImage())).resolves.toMatchObject({
      items: [],
    });
  });

  it("rejects an unreadable merchant or amount with 422", async () => {
    const vision = provider();
    const service = createReceiptService(repository(), vision);

    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
      merchant: "   ",
      amountMinor: 28500,
    });
    await expect(service.extract(env, TENANT_ID, receiptImage())).rejects.toMatchObject({
      status: 422,
      code: "receipt_merchant_unreadable",
    });

    (vision.extract as ReturnType<typeof vi.fn>).mockResolvedValue({ merchant: "Jollibee" });
    await expect(service.extract(env, TENANT_ID, receiptImage())).rejects.toMatchObject({
      status: 422,
      code: "receipt_amount_unreadable",
    });
  });

  it.each([
    ["timeout", 504, "receipt_extraction_timeout"],
    ["rate_limit", 429, "receipt_extraction_rate_limited"],
    ["invalid_response", 502, "receipt_extraction_invalid_response"],
    ["unavailable", 503, "receipt_extraction_unavailable"],
  ] as const)("maps a %s provider failure to %i %s", async (kind, status, code) => {
    const vision = provider();
    (vision.extract as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ReceiptVisionProviderError("cloudflare_workers_ai", kind),
    );
    const service = createReceiptService(repository(), vision);
    await expect(service.extract(env, TENANT_ID, receiptImage())).rejects.toMatchObject({
      status,
      code,
    });
  });
});
