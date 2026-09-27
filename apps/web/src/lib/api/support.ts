import type { BugReportDraft } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { ApiRequestError, isRecord, apiErrorPayload } from "./errors";
import { apiUrl, REQUEST_TIMEOUT_MS, requestJson } from "./transport";

export type SupportPageContext =
  | "landing"
  | "dashboard"
  | "assistant"
  | "calendar"
  | "transactions"
  | "import"
  | "budgets"
  | "subscriptions"
  | "plan"
  | "settings"
  | "app";

export interface SupportChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface SupportChatResponse {
  message: string;
  bugReportDraft?: BugReportDraft;
}

export async function sendSupportChat(
  messages: SupportChatMessageInput[],
  pageContext: SupportPageContext,
  signal?: AbortSignal,
): Promise<SupportChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("request_timeout"), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason ?? "request_aborted");
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(`${apiUrl}/api/support/chat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ messages, pageContext }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = apiErrorPayload(await response.json().catch(() => null));
      throw new ApiRequestError(
        payload.message ?? "Zoption Support could not answer right now. Please try again.",
        response.status,
        payload.error ?? "support_request_failed",
        payload.details,
      );
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || typeof payload.message !== "string" || !payload.message.trim()) {
      throw new ApiRequestError(
        "Zoption Support returned an unexpected response. Please try again.",
        502,
        "invalid_api_response",
      );
    }
    return { message: payload.message.trim() };
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted)
        throw new DOMException("The support request was cancelled.", "AbortError");
      throw new ApiRequestError(
        "Zoption Support took too long to answer. Please try again.",
        0,
        "request_timeout",
      );
    }
    throw new ApiRequestError(
      "Zoption Support could not connect. Check your connection and try again.",
      0,
      "network_error",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function sendAuthenticatedSupportChat(
  workspace: AuthenticatedWorkspace,
  messages: SupportChatMessageInput[],
  pageContext: Exclude<SupportPageContext, "landing">,
  signal?: AbortSignal,
): Promise<SupportChatResponse> {
  return requestJson(workspace, "/api/app/support/chat", {
    method: "POST",
    body: JSON.stringify({ messages, pageContext }),
    signal,
  });
}
