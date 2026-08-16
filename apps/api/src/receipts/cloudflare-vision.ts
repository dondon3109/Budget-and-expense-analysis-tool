import { transactionKinds } from "@zoption/shared";
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
const MAX_RESPONSE_CHARACTERS = 8_000;

const candidateSchema = z
  .object({
    merchant: z.string().optional(),
    date: z.string().optional(),
    amountMinor: z.number().int().optional(),
    kind: z.enum(transactionKinds).optional(),
    categoryName: z.string().optional(),
    rawText: z.string().max(6_000).optional(),
  })
  .strict();

const completionSchema = z.object({
  response: z.string().max(MAX_RESPONSE_CHARACTERS),
});

const EXTRACTION_PROMPT = [
  "Read this receipt photo and return a single JSON object with these fields only:",
  "- merchant: the store or vendor name",
  "- date: the receipt date as YYYY-MM-DD (empty string if no date is visible)",
  "- amountMinor: the total amount in centavos as an integer (28500 means 285.00 PHP)",
  '- kind: exactly one of "expense", "income", or "transfer"',
  "- categoryName: one short category label such as Food, Transport, Utilities (empty string if unclear)",
  "- rawText: the readable text from the receipt, up to a few lines",
  "Return strict JSON without markdown, comments, or extra text.",
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
    return undefined;
  }
  const candidate = candidateSchema.safeParse(parsed);
  if (!candidate.success) return undefined;
  return {
    merchant: candidate.data.merchant?.trim() || undefined,
    date: candidate.data.date?.trim() || undefined,
    amountMinor: candidate.data.amountMinor,
    kind: candidate.data.kind,
    categoryName: candidate.data.categoryName?.trim() || undefined,
    rawText: candidate.data.rawText?.trim() || undefined,
  };
}

export const cloudflareVisionProvider: ReceiptVisionProvider = {
  async extract(env, image) {
    if (!env.AI) {
      throw new ReceiptVisionProviderError("cloudflare_workers_ai", "configuration");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      const result = await env.AI.run(
        env.RECEIPT_VISION_MODEL?.trim() || DEFAULT_RECEIPT_VISION_MODEL,
        {
          image: [encodeBase64(await image.arrayBuffer())],
          prompt: EXTRACTION_PROMPT,
          max_tokens: 512,
        },
        { signal: controller.signal },
      );
      const parsed = completionSchema.safeParse(result);
      if (!parsed.success) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "invalid_response");
      }
      const candidate = parseCandidate(parsed.data.response);
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
