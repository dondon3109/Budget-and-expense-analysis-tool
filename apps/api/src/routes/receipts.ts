import { receiptConsentUpdateSchema } from "@zoption/shared";
import { Hono } from "hono";

import { HttpError } from "../errors";
import type { ReceiptService } from "../receipts/service";
import { readJson } from "../request";
import type { AppEnvironment } from "../types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createReceiptRoutes(service: ReceiptService) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/preferences", async (context) =>
    context.json(await service.getPreferences(context.env, context.get("tenant").tenantId)),
  );

  routes.patch("/preferences", async (context) => {
    const parsed = receiptConsentUpdateSchema.safeParse(await readJson(context));
    if (!parsed.success) {
      throw new HttpError(400, "invalid_request", "Accept the receipt photo notice.");
    }
    return context.json(await service.grantConsent(context.env, context.get("tenant").tenantId));
  });

  routes.post("/extract", async (context) => {
    const form = await context.req.formData();
    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
      throw new HttpError(400, "invalid_receipt_image", "Choose a receipt photo up to 8 MB.");
    }
    const mediaType = image.type.split(";", 1)[0]?.toLowerCase();
    if (!mediaType || !ACCEPTED_IMAGE_TYPES.has(mediaType)) {
      throw new HttpError(415, "unsupported_receipt_image", "Use a JPEG, PNG, or WebP photo.");
    }
    return context.json(await service.extract(context.env, context.get("tenant").tenantId, image));
  });

  return routes;
}
