import {
  importPreviewResponseSchema,
  importCommitResultSchema,
  type ImportCommitRequest,
  type ImportPreview,
  type ImportPreviewRequest,
  type ImportCommitResult,
} from "@zoption/shared";
import { File } from "expo-file-system";

import { publicConfig } from "@/config/public-config";
import { discardTemporarySourceFile } from "@/files/temporary-source-file";
import { fetchMultipartWithTimeout } from "./assistant-voice";

export type ImportTransportErrorCode =
  | "session_expired"
  | "account_deleted"
  | "rate_limited"
  | "preview_not_found"
  | "preview_expired"
  | "nothing_to_import"
  | "invalid_request"
  | "plan_limit"
  | "duplicate_conflict"
  | "entry_consent_required"
  | "network"
  | "invalid_response";

export class ImportTransportError extends Error {
  constructor(
    message: string,
    readonly code: ImportTransportErrorCode,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ImportTransportError";
  }
}

interface ImportErrorBody {
  error?: unknown;
  message?: unknown;
}

function errorMessage(body: ImportErrorBody, fallback: string): string {
  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message.slice(0, 240);
  }
  return fallback;
}

function mapError(status: number, body: ImportErrorBody): ImportTransportError {
  const code = typeof body.error === "string" ? body.error : "";
  if (status === 401) {
    return new ImportTransportError(
      "Your session expired. Sign in again and retry the import.",
      "session_expired",
      status,
    );
  }
  if (status === 403 && code === "account_deleted") {
    return new ImportTransportError(
      "This Zoption account was deleted. The import cannot continue.",
      "account_deleted",
      status,
    );
  }
  if (status === 404 && code === "preview_not_found") {
    return new ImportTransportError(
      "The import preview was not found. Choose the file again.",
      "preview_not_found",
      status,
    );
  }
  if (status === 400 && code === "preview_expired") {
    return new ImportTransportError(
      "The import preview expired. Preview the file again.",
      "preview_expired",
      status,
    );
  }
  if (status === 400 && code === "nothing_to_import") {
    return new ImportTransportError(
      "The preview has no valid rows to import.",
      "nothing_to_import",
      status,
    );
  }
  if (status === 409 && code === "entry_consent_required") {
    return new ImportTransportError(
      errorMessage(body, "Accept the AI entry notice before importing a PDF."),
      "entry_consent_required",
      status,
    );
  }
  if (status === 400 && (code === "stale_duplicate_match" || code === "category_changed")) {
    return new ImportTransportError(
      "The file changed on the server since the preview. Preview the file again.",
      "duplicate_conflict",
      status,
    );
  }
  if (status === 402 || status === 403 || code === "monthly_limit_reached") {
    return new ImportTransportError(
      errorMessage(body, "This import would exceed your plan limits."),
      "plan_limit",
      status,
    );
  }
  if (status === 429) {
    return new ImportTransportError(
      "Zoption is receiving too many import requests right now. Wait a moment and retry.",
      "rate_limited",
      status,
    );
  }
  if (status === 400) {
    return new ImportTransportError(
      errorMessage(body, "Check the import details and try again."),
      "invalid_request",
      status,
    );
  }
  return new ImportTransportError(
    errorMessage(body, "Zoption could not reach the import service."),
    "network",
    status,
  );
}

async function decodeJsonResponse(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    throw new ImportTransportError(
      "Zoption returned an invalid import response.",
      "invalid_response",
      response.status,
    );
  }
}

export async function previewImport({
  accessToken,
  input,
  signal,
  fetchImpl = fetch,
}: {
  accessToken: string;
  input: ImportPreviewRequest;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ImportPreview> {
  let response: Response;
  try {
    response = await fetchImpl(`${publicConfig.apiUrl}/api/app/imports/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ImportTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {
    throw mapError(response.status, (await decodeJsonResponse(response)) as ImportErrorBody);
  }
  const decoded = importPreviewResponseSchema.safeParse(await decodeJsonResponse(response));
  if (!decoded.success) {
    throw new ImportTransportError(
      "Zoption returned an unrecognized import preview.",
      "invalid_response",
      response.status,
    );
  }
  return decoded.data;
}

/** Sends a PDF only for in-flight AI extraction, then receives the usual import preview token. */
export async function previewPdfImport({
  accessToken,
  file,
  fetchImpl = fetch,
}: {
  accessToken: string;
  file: { uri: string; fileName: string };
  fetchImpl?: typeof fetch;
}): Promise<ImportPreview> {
  const form = new FormData();
  try {
    form.append("pdf", new File(file.uri) as unknown as Blob, file.fileName);
  } catch (error) {
    discardTemporarySourceFile(file.uri);
    throw error;
  }
  let response: Response;
  try {
    response = await fetchMultipartWithTimeout(
      fetchImpl,
      `${publicConfig.apiUrl}/api/app/entry/pdf-preview`,
      {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
        body: form,
      },
      undefined,
      "Reading the PDF is taking too long. Try a shorter statement or try again shortly.",
      () => discardTemporarySourceFile(file.uri),
    );
  } catch (error) {
    if (error instanceof ImportTransportError) throw error;
    throw new ImportTransportError(
      error instanceof Error ? error.message : "Zoption could not be reached. Connect and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {
    throw mapError(response.status, (await decodeJsonResponse(response)) as ImportErrorBody);
  }
  const decoded = importPreviewResponseSchema.safeParse(await decodeJsonResponse(response));
  if (!decoded.success) {
    throw new ImportTransportError(
      "Zoption returned an unrecognized PDF import preview.",
      "invalid_response",
      response.status,
    );
  }
  return decoded.data;
}

export async function commitImport({
  accessToken,
  input,
  signal,
  fetchImpl = fetch,
}: {
  accessToken: string;
  input: ImportCommitRequest;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ImportCommitResult> {
  let response: Response;
  try {
    response = await fetchImpl(`${publicConfig.apiUrl}/api/app/imports/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ImportTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  }
  if (!response.ok) {
    throw mapError(response.status, (await decodeJsonResponse(response)) as ImportErrorBody);
  }
  const decoded = importCommitResultSchema.safeParse(await decodeJsonResponse(response));
  if (!decoded.success) {
    throw new ImportTransportError(
      "Zoption returned an unrecognized import result.",
      "invalid_response",
      response.status,
    );
  }
  return decoded.data;
}
