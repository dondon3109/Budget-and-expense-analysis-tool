/** The Worker API. Public, unauthenticated routes only: the site never holds a session. */
export const API_URL = (import.meta.env.PUBLIC_API_URL ?? "https://api.zoption.site").replace(
  /\/$/,
  "",
);

export const REQUEST_TIMEOUT_MS = 20_000;

export type SupportChatMessageInput = { role: "user" | "assistant"; content: string };

/**
 * A support request failure with the message the visitor should see. The
 * Worker's own message wins when it sends one.
 */
export class SupportRequestError extends Error {
  override name = "SupportRequestError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function sendSupportChat(
  messages: SupportChatMessageInput[],
  signal: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("request_timeout"), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal.reason ?? "request_aborted");
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetch(`${API_URL}/api/support/chat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ messages, pageContext: "landing" }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new SupportRequestError(
        isRecord(payload) && typeof payload.message === "string"
          ? payload.message
          : "Zoption Support could not answer right now. Please try again.",
      );
    }
    if (!isRecord(payload) || typeof payload.message !== "string" || !payload.message.trim()) {
      throw new SupportRequestError(
        "Zoption Support returned an unexpected response. Please try again.",
      );
    }
    return payload.message.trim();
  } catch (error) {
    if (error instanceof SupportRequestError) throw error;
    if (controller.signal.aborted) {
      if (signal.aborted)
        throw new DOMException("The support request was cancelled.", "AbortError");
      throw new SupportRequestError("Zoption Support took too long to answer. Please try again.");
    }
    throw new SupportRequestError(
      "Zoption Support could not connect. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortFromCaller);
  }
}
