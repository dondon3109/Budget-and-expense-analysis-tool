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
  // Newer Workers AI responses put the model output in "response"; for the
  // vision model this is either prose containing JSON or a parsed object
  // when the model complies with a strict-JSON prompt.
  response: z.union([
    z.string().max(MAX_RESPONSE_CHARACTERS),
    z.record(z.string(), z.unknown()),
  ]),
});

const EXTRACTION_PROMPT = [
  "Read this receipt photo.",
  "Respond with ONLY a JSON object, nothing else, starting with { and ending with }.",
  "Fields:",
  "- merchant: the store or vendor name",
  "- date: the receipt date as YYYY-MM-DD",
  "- amountMinor: the total amount in centavos as an integer (for example 353.00 PHP is 35300)",
  '- kind: exactly one of "expense", "income", or "transfer"',
  "- categoryName: one short category label such as Food, Transport, Utilities",
  "- rawText: the readable text from the receipt, up to a few lines",
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
      const mediaType = image.type.split(";", 1)[0]?.toLowerCase() || "image/jpeg";
      const dataUrl =
        "data:" + mediaType + ";base64," + encodeBase64(await image.arrayBuffer());
      const result = await env.AI.run(
        env.RECEIPT_VISION_MODEL?.trim() || DEFAULT_RECEIPT_VISION_MODEL,
        {
          // The model input schema accepts a single data-URL string for the
          // image; an array of data URLs is rejected by the Workers AI API.
          image: dataUrl,
          prompt: EXTRACTION_PROMPT,
          max_tokens: 1024,
        },
        { signal: controller.signal },
      );
      const parsed = completionSchema.safeParse(result);
      if (!parsed.success) {
        throw new ReceiptVisionProviderError("cloudflare_workers_ai", "invalid_response");
      }
      const responseText =
        typeof parsed.data.response === "string"
          ? parsed.data.response
          : JSON.stringify(parsed.data.response);
      const candidate = parseCandidate(responseText);
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