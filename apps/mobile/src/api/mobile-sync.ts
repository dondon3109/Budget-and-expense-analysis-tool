import {
  MOBILE_SYNC_PROTOCOL_VERSION,
  mobileSyncPullResponseSchema,
  type MobileSyncPullResponse,
} from "@zoption/shared";

import { publicConfig } from "@/config/public-config";

const MAX_PULL_RESPONSE_BYTES = 512 * 1024;

export type MobileSyncTransportErrorCode =
  | "session_expired"
  | "account_deleted"
  | "full_resync_required"
  | "rate_limited"
  | "retryable"
  | "invalid_response";

export class MobileSyncTransportError extends Error {
  constructor(
    message: string,
    readonly code: MobileSyncTransportErrorCode,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "MobileSyncTransportError";
  }
}

async function decodeResponse(response: Response): Promise<unknown> {
  const advertisedLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_PULL_RESPONSE_BYTES) {
    throw new MobileSyncTransportError(
      "Zoption returned more synchronization data than this app can safely process.",
      "invalid_response",
      response.status,
    );
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_PULL_RESPONSE_BYTES) {
    throw new MobileSyncTransportError(
      "Zoption returned more synchronization data than this app can safely process.",
      "invalid_response",
      response.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MobileSyncTransportError(
      "Zoption returned an invalid synchronization response.",
      "invalid_response",
      response.status,
    );
  }
}

export async function pullMobileSync({
  accessToken,
  cursor,
  limit = 100,
  signal,
  fetchImpl = fetch,
}: {
  accessToken: string;
  cursor: string | null;
  limit?: number;
  signal?: AbortSignal;
  fetchImpl?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
}): Promise<MobileSyncPullResponse> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/app/sync/pull", publicConfig.apiUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION, cursor, limit }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new MobileSyncTransportError(
      "Zoption could not reach the synchronization service.",
      "retryable",
      0,
    );
  }

  if (response.status === 401) {
    throw new MobileSyncTransportError(
      "Your session expired before synchronization completed.",
      "session_expired",
      401,
    );
  }
  if (response.status === 410) {
    throw new MobileSyncTransportError(
      "This account was deleted while synchronization was in progress.",
      "account_deleted",
      410,
    );
  }
  if (response.status === 409) {
    const payload = await decodeResponse(response);
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      payload.error === "full_resync_required"
    ) {
      throw new MobileSyncTransportError(
        "This local copy needs a safe full resynchronization.",
        "full_resync_required",
        409,
      );
    }
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new MobileSyncTransportError(
      "Zoption is receiving too many synchronization requests. Try again shortly.",
      "rate_limited",
      429,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
    );
  }
  if (!response.ok) {
    throw new MobileSyncTransportError(
      "Zoption could not synchronize right now. Your local records are unchanged.",
      "retryable",
      response.status,
    );
  }

  const parsed = mobileSyncPullResponseSchema.safeParse(await decodeResponse(response));
  if (!parsed.success) {
    throw new MobileSyncTransportError(
      "Zoption returned an invalid synchronization response.",
      "invalid_response",
      response.status,
    );
  }
  return parsed.data;
}
