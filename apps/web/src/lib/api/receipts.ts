import type { ReceiptDraft, ReceiptPreferences } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, apiErrorPayload } from "./errors";
import { workspaceFetch, requestJson } from "./transport";

export function getReceiptPreferences(
  workspace: AuthenticatedWorkspace,
): Promise<ReceiptPreferences> {
  return requestJson(workspace, "/api/app/receipts/preferences");
}

export function grantReceiptConsent(
  workspace: AuthenticatedWorkspace,
): Promise<ReceiptPreferences> {
  return requestJson(workspace, "/api/app/receipts/preferences", {
    method: "PATCH",
    body: JSON.stringify({ consented: true }),
  });
}

export async function extractReceipt(
  workspace: AuthenticatedWorkspace,
  image: Blob,
): Promise<ReceiptDraft> {
  const form = new FormData();
  const extension = image.type.includes("png")
    ? "png"
    : image.type.includes("webp")
      ? "webp"
      : "jpg";
  form.set("image", image, "receipt." + extension);
  const response = await workspaceFetch(
    workspace,
    "/api/app/receipts/extract",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    },
    { timeoutMs: 60_000 },
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ?? "The receipt could not be read.",
      response.status,
      payload.error ?? "receipt_extraction_failed",
      payload.details,
    );
  }
  return (await response.json()) as ReceiptDraft;
}
