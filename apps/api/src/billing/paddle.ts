import { HttpError } from "../errors";
import type { Bindings } from "../types";

function apiBaseUrl(env: Bindings): string {
  if (env.PADDLE_ENVIRONMENT === "sandbox") return "https://sandbox-api.paddle.com";
  if (env.PADDLE_ENVIRONMENT === "production") return "https://api.paddle.com";
  throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
}

function apiKey(env: Bindings): string {
  const value = env.PADDLE_API_KEY?.trim();
  if (!value) throw new HttpError(503, "billing_not_configured", "Billing is not configured yet.");
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function isPaddlePortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "paddle.com" || url.hostname.endsWith(".paddle.com"))
    );
  } catch {
    return false;
  }
}

export async function createCustomerPortalSession(
  env: Bindings,
  customerId: string,
  subscriptionIds: string[],
): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl(env)}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey(env)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription_ids: subscriptionIds }),
    },
  );

  if (!response.ok) {
    throw new HttpError(502, "billing_provider_error", "The billing portal could not be opened.");
  }

  const payload = asRecord(await response.json());
  const data = payload ? asRecord(payload.data) : null;
  const urls = data ? asRecord(data.urls) : null;
  const general = urls ? asRecord(urls.general) : null;
  const overview = general?.overview;
  if (typeof overview !== "string" || !isPaddlePortalUrl(overview)) {
    throw new HttpError(502, "billing_provider_error", "The billing portal could not be opened.");
  }
  return overview;
}
