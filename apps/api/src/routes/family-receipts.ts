import { FAMILY_RECEIPT_MAX_BYTES } from "@zoption/shared";
import { Hono } from "hono";

import { hasImageSignature, isAllowedImageType } from "../avatars";
import type { FamilyReceiptRepository } from "../db/family-receipts";
import { HttpError } from "../errors";
import { parsePathParameter } from "../request";
import type { AppEnvironment } from "../types";
import { familyTenantId } from "./remittances";
import { entryAccess } from "./transactions";

const WRONG_TYPE = "Choose a JPEG, PNG, or WebP photo.";

/**
 * `/api/app/family/receipts`: the one photo on a family transaction. Everyone reads it through
 * this route only; whoever may edit the entry adds, replaces, or removes it.
 */
export function createFamilyReceiptRoutes(receipts: FamilyReceiptRepository) {
  const routes = new Hono<AppEnvironment>();

  routes.get("/:transactionId", async (context) => {
    const tenantId = familyTenantId(context.get("tenant"));
    const transactionId = parsePathParameter(context.req.param("transactionId"));
    const photo = await receipts.read(context.env, tenantId, transactionId);
    if (!photo) throw new HttpError(404, "receipt_not_found", "This entry has no receipt photo.");
    return new Response(photo.body, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  // Multipart, so the path stays exact for the body-limit rule: `transactionId` and `file`.
  routes.post("/", async (context) => {
    const tenant = context.get("tenant");
    const tenantId = familyTenantId(tenant);
    const form = await context.req.formData();
    const field = form.get("transactionId");
    const transactionId = parsePathParameter(typeof field === "string" ? field : "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(400, "invalid_receipt_image", WRONG_TYPE);
    }
    if (file.size > FAMILY_RECEIPT_MAX_BYTES) {
      throw new HttpError(400, "invalid_receipt_image", "Receipt photos must be 5 MB or smaller.");
    }
    const contentType = file.type.split(";", 1)[0]?.toLowerCase() ?? "";
    const bytes = await file.arrayBuffer();
    if (
      !isAllowedImageType(contentType) ||
      !hasImageSignature(contentType, new Uint8Array(bytes))
    ) {
      throw new HttpError(415, "unsupported_receipt_image", WRONG_TYPE);
    }
    const userId = context.get("authUser").id;
    await receipts.attach(
      context.env,
      tenantId,
      userId,
      transactionId,
      { bytes, contentType },
      entryAccess(tenant, userId),
    );
    return context.body(null, 204);
  });

  routes.delete("/:transactionId", async (context) => {
    const tenant = context.get("tenant");
    await receipts.remove(
      context.env,
      familyTenantId(tenant),
      parsePathParameter(context.req.param("transactionId")),
      entryAccess(tenant, context.get("authUser").id),
    );
    return context.body(null, 204);
  });

  return routes;
}
