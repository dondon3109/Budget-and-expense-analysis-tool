import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, apiErrorPayload } from "./errors";
import { workspaceFetch } from "./transport";

// A family transaction's one receipt photo. It is read only through the signed-in API, so the
// page shows it from a blob and never holds a shareable URL.

function receiptPath(transactionId: string): string {
  return `/api/app/family/receipts/${encodeURIComponent(transactionId)}`;
}

async function failure(response: Response, fallback: string): Promise<ApiRequestError> {
  const payload = apiErrorPayload(await response.json().catch(() => null));
  return new ApiRequestError(
    payload.message ?? fallback,
    response.status,
    payload.error ?? "request_failed",
    payload.details,
  );
}

/** The photo, or null when the entry has none. */
export async function getFamilyReceipt(
  family: AuthenticatedWorkspace,
  transactionId: string,
): Promise<Blob | null> {
  const response = await workspaceFetch(family, receiptPath(transactionId), {
    headers: { Accept: "image/*" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await failure(response, "The receipt photo could not be loaded.");
  return response.blob();
}

/** Adds the photo, replacing any earlier one. */
export async function uploadFamilyReceipt(
  family: AuthenticatedWorkspace,
  transactionId: string,
  photo: Blob,
): Promise<void> {
  const form = new FormData();
  form.set("transactionId", transactionId);
  form.set("file", photo, "receipt");
  const response = await workspaceFetch(
    family,
    "/api/app/family/receipts",
    { method: "POST", headers: { Accept: "application/json" }, body: form },
    { timeoutMs: 60_000 },
  );
  if (!response.ok) throw await failure(response, "The receipt photo could not be saved.");
}

export async function removeFamilyReceipt(
  family: AuthenticatedWorkspace,
  transactionId: string,
): Promise<void> {
  const response = await workspaceFetch(family, receiptPath(transactionId), { method: "DELETE" });
  if (!response.ok) throw await failure(response, "The receipt photo could not be removed.");
}
