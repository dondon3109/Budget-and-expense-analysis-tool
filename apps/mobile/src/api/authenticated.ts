import { publicConfig } from "@/config/public-config";

export type ApiTransportErrorCode =
  | "session_expired"
  | "account_deleted"
  | "rate_limited"
  | "plan_limit"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "network"
  | "invalid_response"
  | "unavailable";

export class ApiTransportError extends Error {
  constructor(
    message: string,
    readonly code: ApiTransportErrorCode,
    readonly status: number,
    readonly serverCode: string | null = null,
  ) {
    super(message);
    this.name = "ApiTransportError";
  }
}

interface ApiErrorBody {
  error?: unknown;
  message?: unknown;
  details?: unknown;
}

export function errorMessage(body: ApiErrorBody, fallback: string): string {
  if (typeof body.message === "string" && body.message.trim().length > 0) {
    return body.message.slice(0, 240);
  }
  return fallback;
}

/**
 * Shared classification of Worker error responses for the online-only surfaces.
 * The server remains authoritative; this only maps failures to honest copy.
 */
export function mapApiError(
  status: number,
  body: ApiErrorBody,
  fallback: string,
): ApiTransportError {
  const code = typeof body.error === "string" ? body.error : "";
  if (status === 401) {
    return new ApiTransportError(
      "Your session expired. Sign in again and retry.",
      "session_expired",
      status,
      code,
    );
  }
  if (status === 403 && code === "account_deleted") {
    return new ApiTransportError(
      "This Zoption account was deleted.",
      "account_deleted",
      status,
      code,
    );
  }
  if (status === 429) {
    return new ApiTransportError(
      "Zoption is receiving too many requests right now. Wait a moment and retry.",
      "rate_limited",
      status,
      code,
    );
  }
  if (
    status === 402 ||
    code === "monthly_limit_reached" ||
    code === "assistant_cycle_limit_reached" ||
    code === "billing_required"
  ) {
    return new ApiTransportError(
      errorMessage(body, "This needs a Zoption Pro plan."),
      "plan_limit",
      status,
      code,
    );
  }
  if (status === 404) {
    return new ApiTransportError(
      errorMessage(body, "That feature is not available."),
      "not_found",
      status,
      code,
    );
  }
  if (status === 500 || status === 503) {
    return new ApiTransportError(
      errorMessage(body, fallback),
      "unavailable",
      status,
      code,
    );
  }
  if (status === 409) {
    return new ApiTransportError(
      errorMessage(body, fallback),
      "conflict",
      status,
      code,
    );
  }
  if (status === 400 || status === 415 || status === 422) {
    return new ApiTransportError(
      errorMessage(body, "Check the request and try again."),
      "invalid_request",
      status,
      code,
    );
  }
  return new ApiTransportError(errorMessage(body, fallback), "network", status, code);
}

export async function decodeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiTransportError(
      "Zoption returned an unrecognized response.",
      "invalid_response",
      response.status,
    );
  }
}

export async function apiRequest<T>({
  accessToken,
  path,
  method,
  body,
  headers,
  signal,
  fetchImpl = fetch,
  decode,
  fallback,
  timeoutMs,
}: {
  accessToken: string;
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  decode: (value: unknown) => T;
  fallback: string;
  timeoutMs?: number;
}): Promise<T> {
  let response: Response;
  const url = publicConfig.apiUrl + path;
  // Long operations (assistant turns) opt into their own ceiling. Without it
  // the request waits indefinitely; with it, our own timer maps to a friendly
  // timeout error while caller-initiated aborts keep propagating untouched.
  const controller = timeoutMs === undefined ? null : new AbortController();
  let timedOut = false;
  const timer =
    controller === null || timeoutMs === undefined
      ? null
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
  const forwardAbort = () => controller?.abort();
  if (controller !== null) {
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller?.signal ?? signal,
    });
  } catch (error) {
    if (controller !== null && timedOut) {
      throw new ApiTransportError(
        "The assistant took too long. Try again.",
        "network",
        0,
        "request_timeout",
      );
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiTransportError(
      "Zoption could not be reached. Connect to the internet and retry.",
      "network",
      0,
    );
  } finally {
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
  if (!response.ok) {
    throw mapApiError(response.status, (await decodeJson(response)) as ApiErrorBody, fallback);
  }
  try {
    return decode(await decodeJson(response));
  } catch (error) {
    if (error instanceof ApiTransportError) throw error;
    throw new ApiTransportError(
      "Zoption returned an unrecognized response.",
      "invalid_response",
      response.status,
    );
  }
}
