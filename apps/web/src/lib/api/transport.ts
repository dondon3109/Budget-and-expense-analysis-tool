import { getSupabaseClient } from "../supabase";
import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, apiErrorPayload } from "./errors";

export const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

async function accessToken(workspace: AuthenticatedWorkspace, refresh: boolean): Promise<string> {
  const client = getSupabaseClient();
  const result = refresh ? await client.auth.refreshSession() : await client.auth.getSession();
  if (result.error) throw result.error;
  const session = result.data.session;
  if (!session || session.user.id !== workspace.userId) {
    throw new ApiRequestError("Your session has expired. Sign in again.", 401, "session_expired");
  }
  return session.access_token;
}

async function signOutAfterUnauthorized() {
  try {
    await getSupabaseClient().auth.signOut({ scope: "local" });
  } catch {
    // The auth state listener still clears local workspace data when sign-out succeeds locally.
  }
}

/** Ceiling for a single attempt, so a stalled worker cannot leave the UI hanging indefinitely. */
export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * A read that hit the ceiling is usually a stalled socket on a lossy connection rather than a dead
 * server, so one repeat after a short pause usually succeeds — which puts the worst case for a
 * default read at 41 seconds rather than 20. Writes never repeat: a request that timed out may
 * still have been applied. A direct call site can opt a read back out with `retryOnTimeout`.
 */
const TIMEOUT_RETRY_BACKOFF_MS = 1_000;

export async function workspaceFetch(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit,
  options: { retryUnauthorized?: boolean; timeoutMs?: number; retryOnTimeout?: boolean } = {},
): Promise<Response> {
  const callerSignal = init.signal;
  const method = (init.method ?? "GET").toUpperCase();
  const retryOnTimeout = options.retryOnTimeout ?? (method === "GET" || method === "HEAD");

  const attempt = async (): Promise<Response> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    const run = async (refresh: boolean) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${await accessToken(workspace, refresh)}`);
      return fetch(`${apiUrl}${path}`, { ...init, headers, signal: controller.signal });
    };

    try {
      let response = await run(false);
      if (response.status === 410) {
        await signOutAfterUnauthorized();
      } else if (response.status === 401 && options.retryUnauthorized !== false) {
        try {
          response = await run(true);
        } catch (error) {
          // Our own ceiling is a stalled connection, not a rejected session, so keep the user signed
          // in and let the retry below cover it.
          if (timedOut) throw error;
          await signOutAfterUnauthorized();
          throw new ApiRequestError(
            "Your session has expired. Sign in again.",
            401,
            "session_expired",
          );
        }
        if (response.status === 401) await signOutAfterUnauthorized();
      }
      return response;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      if (timedOut) {
        // Our own ceiling fired: never leak the raw AbortError (Chrome reports
        // it as "signal is aborted without reason"). Caller-initiated aborts
        // keep propagating untouched.
        throw new ApiRequestError("The request took too long. Try again.", 0, "request_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    const stalled = error instanceof ApiRequestError && error.code === "request_timeout";
    if (!retryOnTimeout || !stalled || callerSignal?.aborted) throw error;
    await new Promise((resolve) => setTimeout(resolve, TIMEOUT_RETRY_BACKOFF_MS));
    // The caller gave up during the pause: surface their abort, not the timeout that preceded it.
    if (callerSignal?.aborted) throw callerSignal.reason;
    return attempt();
  }
}

export async function requestJson<T>(
  workspace: AuthenticatedWorkspace,
  path: string,
  init: RequestInit = {},
  options: { retryUnauthorized?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const response = await workspaceFetch(
    workspace,
    path,
    {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
    options,
  );
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The request could not be completed."),
      response.status,
      payload.error ?? "request_failed",
      payload.details,
    );
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    throw new ApiRequestError(
      "The API returned an unexpected response. Check the API URL configuration.",
      502,
      "invalid_api_response",
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError(
      "The API returned invalid JSON. Try again or check the API deployment.",
      502,
      "invalid_api_response",
    );
  }
}

export async function requestBlob(workspace: AuthenticatedWorkspace, path: string): Promise<Blob> {
  const response = await workspaceFetch(workspace, path, { headers: { Accept: "text/csv" } });
  if (!response.ok) {
    const payload = apiErrorPayload(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.message ??
        (response.status === 401
          ? "Your session has expired. Sign in again."
          : "The download could not be prepared."),
      response.status,
      payload.error ?? "request_failed",
      payload.details,
    );
  }
  return response.blob();
}
