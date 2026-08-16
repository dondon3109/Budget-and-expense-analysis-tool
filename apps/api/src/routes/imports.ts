import {
  importCommitSchema,
  importPreviewRequestSchema,
  receiptScanRequestSchema,
  receiptScanResponseSchema,
} from "@zoption/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { ImportRepository } from "../db/imports";
import { HttpError } from "../errors";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

const RECEIPT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const looseVisionSchema = z.object({
  merchant: z.union([z.string(), z.null()]).optional(),
  date: z.union([z.string(), z.null()]).optional(),
  amountMinor: z.union([z.number(), z.string(), z.null()]).optional(),
  currency: z.union([z.string(), z.null()]).optional(),
});

function coerceMerchant(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return trimmed.length > 0 && trimmed.length <= 140 ? trimmed : null;
}

function coerceDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : null;
}

function coerceAmountMinor(value: unknown): number | null {
  const numeric = typeof value === "string" ? Number(value) : typeof value === "number" ? value : null;
  if (numeric === null || !Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return rounded >= 0 && rounded <= 1_000_000_000 ? rounded : null;
}

function coerceCurrency(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

export function createImportRoutes(repository: ImportRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.post("/receipt-scan", async (context) => {
    const body = await readJson(context);
    const parsed = receiptScanRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Send a JPEG, PNG or WebP receipt image.");
    }
    if (!context.env?.AI) {
      throw new HttpError(
        503,
        "provider_unavailable",
        "The receipt scanner is not configured yet. Try again shortly.",
      );
    }

    const prompt = [
      "You are a receipt parser. Extract from the receipt image exactly one JSON object with keys:",
      "merchant (string or null), date (YYYY-MM-DD or null), amountMinor (integer total in minor currency units, or null), currency (3-letter code or null).",
      "If a field is not readable, use null. Respond with only the JSON object.",
    ].join(" ");

    let raw: string;
    try {
      const result = await context.env.AI.run(RECEIPT_VISION_MODEL, {
        image: `data:${parsed.data.mimeType};base64,${parsed.data.imageBase64}`,
        prompt,
        max_tokens: 512,
      });
      const responseText = (result as { response?: unknown } | string | undefined)?.response;
      raw =
        typeof result === "string"
          ? result
          : typeof responseText === "string"
            ? responseText
            : JSON.stringify(result);
    } catch {
      throw new HttpError(
        502,
        "provider_failed",
        "The receipt scanner could not read this image. Try again with a clearer photo.",
      );
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new HttpError(
        502,
        "invalid_response",
        "The receipt scanner could not read this image. Try again with a clearer photo.",
      );
    }
    let vision: unknown;
    try {
      vision = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch {
      throw new HttpError(
        502,
        "invalid_response",
        "The receipt scanner could not read this image. Try again with a clearer photo.",
      );
    }
    const loose = looseVisionSchema.safeParse(vision);
    if (!loose.success) {
      throw new HttpError(
        502,
        "invalid_response",
        "The receipt scanner could not read this image. Try again with a clearer photo.",
      );
    }
    const scanned = receiptScanResponseSchema.parse({
      merchant: coerceMerchant(loose.data.merchant),
      date: coerceDate(loose.data.date),
      amountMinor: coerceAmountMinor(loose.data.amountMinor),
      currency: coerceCurrency(loose.data.currency),
    });
    return context.json(scanned);
  });

  routes.post("/preview", async (context) => {
    const body = await readJson(context);
    const parsed = importPreviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_request",
        "Check the import details.",
        parsed.error.flatten(),
      );
    }
    return context.json(
      await repository.preview(context.env, context.get("tenant").tenantId, parsed.data),
    );
  });

  routes.post("/commit", async (context) => {
    const body = await readJson(context);
    const parsed = importCommitSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "The preview token is invalid.");
    }
    return context.json(
      await repository.commit(context.env, context.get("tenant").tenantId, parsed.data),
      201,
    );
  });

  return routes;
}
