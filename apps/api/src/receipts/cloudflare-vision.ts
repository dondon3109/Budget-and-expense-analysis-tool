import { receiptPaymentTypes, transactionKinds } from "@zoption/shared";
import { z } from "zod";

import type { Bindings } from "../types";
import {
  DEFAULT_RECEIPT_VISION_MODEL,
  ReceiptVisionProviderError,
  type ReceiptVisionCandidate,
  type ReceiptVisionProvider,
} from "./vision-provider";

const DEFAULT_TIMEOUT_MS = 30_000;
const BINARY_CHUNK_SIZE = 32_768;
const MAX_RESPONSE_CHARACTERS = 12_000;

const candidateItemSchema = z
  .object({
    description: z.string().optional(),
    amountMinor: z.number().int().optional(),
    categoryName: z.string().optional(),
  })
  .strict();

// Every payment field is nullable because JSON-schema decoding fills an unknown field with null.
const candidatePaymentSchema = z
  .object({
    provider: z.string().nullish(),
    type: z.enum(receiptPaymentTypes).nullish(),
    counterparty: z.string().nullish(),
    referenceNo: z.union([z.string(), z.number()]).nullish(),
    feeMinor: z.number().int().nullish(),
    sentAmountMinor: z.number().int().nullish(),
    sentCurrency: z.string().nullish(),
    exchangeRate: z.union([z.string(), z.number()]).nullish(),
  })
  .strict();

const candidateSchema = z
  .object({
    merchant: z.string().nullish(),
    date: z.string().nullish(),
    amountMinor: z.number().int().nullish(),
    kind: z.enum(transactionKinds).nullish(),
    categoryName: z.string().nullish(),
    items: z.array(candidateItemSchema).max(30).nullish(),
    payment: candidatePaymentSchema.nullish(),
    rawText: z.string().max(6_000).nullish(),
  })
  .strict();

const completionSchema = z.union([
  // Chat-completion models (Gemma 4) answer in OpenAI shape.
  z.object({
    choices: z
      .array(
        z.object({
          message: z.object({ content: z.string().max(MAX_RESPONSE_CHARACTERS).nullable() }),
        }),
      )
      .min(1),
  }),
  // Older Workers AI models put the output in "response", as prose containing JSON or as an
  // already parsed object.
  z.object({
    response: z.union([z.string().max(MAX_RESPONSE_CHARACTERS), z.record(z.string(), z.unknown())]),
  }),
]);

const nullableString = { type: ["string", "null"] };
const nullableInteger = { type: ["integer", "null"] };

/** Constrains decoding so the model cannot answer with prose or invent keys. */
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: nullableString,
    date: nullableString,
    amountMinor: nullableInteger,
    kind: { type: ["string", "null"], enum: [...transactionKinds, null] },
    categoryName: nullableString,
    items: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          amountMinor: { type: "integer" },
          categoryName: { type: "string" },
        },
        required: ["description", "amountMinor"],
      },
    },
    payment: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        provider: nullableString,
        type: { type: ["string", "null"], enum: [...receiptPaymentTypes, null] },
        counterparty: nullableString,
        referenceNo: nullableString,
        feeMinor: nullableInteger,
        sentAmountMinor: nullableInteger,
        sentCurrency: nullableString,
        exchangeRate: nullableString,
      },
    },
    rawText: nullableString,
  },
  required: ["merchant", "date", "amountMinor", "kind", "items", "payment", "rawText"],
} as const;

const EXTRACTION_PROMPT = [
  "Read this image. It is either a paper store receipt, or a screenshot of a Philippine e-wallet, bank, or remittance confirmation (GCash, Maya, GoTyme, BDO, BPI, UnionBank, Metrobank, Landbank, Security Bank, RCBC, PNB, Western Union, Remitly, Wise, or a remittance or tax calculator).",
  "Respond with ONLY a JSON object, nothing else, starting with { and ending with }.",
  "Write every money amount in centavos as an integer: 353.00 PHP is 35300 and 2,400.00 is 240000.",
  "Fields:",
  "- merchant: the store or vendor name. For a wallet or bank screenshot: the recipient, biller, or store paid; for money received: the sender. Copy masked names exactly as shown, for example JA•••N M•• L.",
  "- date: the transaction date as YYYY-MM-DD",
  "- amountMinor: the total that left or entered the account in centavos, including any fee (the Total Amount Sent, Total Amount, or Amount Due when present)",
  '- kind: exactly one of "expense", "income", or "transfer"',
  "- categoryName: one short category label such as Food, Transport, Utilities, Bills, Family support",
  "- items: for a paper receipt, an array of up to 30 individually charged purchase lines. Each item has description, amountMinor in centavos as the final line total, and optional categoryName.",
  "  Include every readable product or paid fee line, using the extended price when a line shows quantity times unit price. Exclude VATable sales, VAT-exempt sales, zero-rated sales, and VAT amount summaries. Include each discount, coupon, promotion, senior citizen or PWD discount, and Less VAT deduction as its own item with a negative amountMinor. Exclude receipt headers, subtotal, grand total, payment, tendered cash, and change. Items including discounts should add up to amountMinor. Use [] if no individual line is readable, and [] for every wallet, bank, or remittance screenshot.",
  "- payment: null for a paper store receipt. For a wallet, bank, or remittance confirmation, an object with:",
  "  - provider: the app or bank that issued the confirmation, for example GCash, Maya, BDO, Western Union",
  '  - type: one of "send_money" (Send Money or Express Send to a person), "receive_money" (money received by the user), "bill_payment" (Pay Bills, biller payments, government payments), "merchant_payment" (QR Ph or online store payments), "cash_in", "cash_out", "bank_transfer" (InstaPay, PESONet, or transfer to a bank account), "remittance" (money sent across borders), "mobile_load" (Buy Load), or "other"',
  "  - counterparty: the recipient, biller, sender, or store name as shown, or null",
  "  - referenceNo: the reference, transaction, or trace number as shown, or null",
  "  - feeMinor: the service, convenience, or transfer fee in centavos, 0 when the screen shows no fee, or null when unclear",
  "  - sentAmountMinor and sentCurrency: for a remittance or calculator, the foreign amount in its own hundredths and its 3-letter currency code, otherwise null",
  "  - exchangeRate: the printed exchange rate as text such as 56.12, otherwise null",
  "- rawText: the readable text from the image, up to a few lines. Skip ads, carbon footprint notes, and promotions.",
].join("\n");

function timeoutMs(env: Bindings): number {
  const parsed = Number(env.RECEIPT_VISION_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 60_000
    ? parsed
    : DEFAULT_TIMEOUT_MS;
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BINARY_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BINARY_CHUNK_SIZE));
  }
  return btoa(binary);
}

function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}

function firstJsonBlock(text: string): string | undefined {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return undefined;
}

function parseCandidate(text: string): ReceiptVisionCandidate | undefined {
  const stripped = text
    .trim()
    .replace(new RegExp("^" + "```" + "(?:json)?\\s*", "i"), "")
    .replace(new RegExp("```" + "\\s*$"), "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const block = firstJsonBlock(stripped);
    if (!block) return undefined;
    try {
      parsed = JSON.parse(block);
    } catch {
      return undefined;
    }
  }
  const candidate = candidateSchema.safeParse(parsed);
  if (!candidate.success) return undefined;
  return {
    merchant: candidate.data.merchant?.trim() || undefined,
    date: candidate.data.date?.trim() || undefined,
    amountMinor: candidate.data.amountMinor ?? undefined,
    kind: candidate.data.kind ?? undefined,
    categoryName: candidate.data.categoryName?.trim() || undefined,
    items: candidate.data.items?.map((item) => ({
      description: item.description?.trim() || undefined,
      amountMinor: item.amountMinor,
      categoryName: item.categoryName?.trim() || undefined,
    })),
    payment: candidate.data.payment ? candidatePayment(candidate.data.payment) : undefined,
    rawText: candidate.data.rawText?.trim() || undefined,
  };
}

function candidatePayment(
  payment: z.infer<typeof candidatePaymentSchema>,
): NonNullable<ReceiptVisionCandidate["payment"]> {
  const text = (value: string | number | null | undefined) =>
    value === null || value === undefined ? undefined : String(value).trim() || undefined;
  return {
    provider: text(payment.provider),
    type: payment.type ?? undefined,
    counterparty: text(payment.counterparty),
    referenceNo: text(payment.referenceNo),
    feeMinor: payment.feeMinor ?? undefined,
    sentAmountMinor: payment.sentAmountMinor ?? undefined,
    sentCurrency: text(payment.sentCurrency)?.toUpperCase(),
    exchangeRate: text(payment.exchangeRate),
  };
}

function completionText(completion: z.infer<typeof completionSchema>): string | undefined {
  if ("choices" in completion) return completion.choices[0]?.message.content ?? undefined;
  return typeof completion.response === "string"
    ? completion.response
    : JSON.stringify(completion.response);
}

export const cloudflareVisionProvider: ReceiptVisionProvider = {
  async extract(env, image) {
    if (!env.AI) {
      throw new ReceiptVisionProviderError("cloudflare_workers_ai", "configuration");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      const mediaType = image.type.split(";", 1)[0]?.toLowerCase() || "image/jpeg";
      const dataUrl = "data:" + mediaType + ";base64," + encodeBase64(await image.arrayBuffer());
      const result = await env.AI.run(
        env.RECEIPT_VISION_MODEL?.trim() || DEFAULT_RECEIPT_VISION_MODEL,
        {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: EXTRACTION_PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "receipt", schema: RESPONSE_JSON_SCHEMA },
          },
          // Reading a receipt needs no step-by-step reasoning, and thinking tokens would eat
          // into the output budget and the timeout.
          chat_template_kwargs: { enable_thinking: false },
          temperature: 0,
          max_tokens: 2048,
        },
        { signal: controller.signal },
      );
      const parsed = completionSchema.safeParse(result);
      if (!parsed.success) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "invalid_response");
      }
      const responseText = completionText(parsed.data);
      const candidate = responseText ? parseCandidate(responseText) : undefined;
      if (!candidate) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "invalid_response");
      }
      return candidate;
    } catch (error) {
      if (error instanceof ReceiptVisionProviderError) throw error;
      const status = providerStatus(error);
      if (controller.signal.aborted) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "timeout");
      }
      if (status === 429) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "rate_limit", status);
      }
      throw new ReceiptVisionProviderError("cloudflare_workers_ai", "unavailable", status);
    } finally {
      clearTimeout(timer);
    }
  },
};
