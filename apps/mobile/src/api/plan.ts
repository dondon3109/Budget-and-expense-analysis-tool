import { z } from "zod";

import { publicConfig } from "@/config/public-config";

export type Plan = "free" | "zoption_pro";

const billingSummarySchema = z.object({
  plan: z.enum(["free", "zoption_pro"]),
});

export type PlanErrorCode =
  | "session_expired"
  | "account_deleted"
  | "unreachable"
  | "invalid_response";

export class PlanError extends Error {
  constructor(
    message: string,
    readonly code: PlanErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

export async function readPlan({
  accessToken,
  signal,
  fetchImpl = fetch,
}: {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
}): Promise<Plan> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/app/billing", publicConfig.apiUrl), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new PlanError(
      "Zoption could not reach your workspace. Check your connection and try again.",
      "unreachable",
      0,
    );
  }

  if (response.status === 401) {
    throw new PlanError(
      "Your session expired. Sign in again to open your workspace.",
      "session_expired",
      401,
    );
  }
  if (response.status === 410) {
    throw new PlanError(
      "This Zoption account has been deleted and cannot open a workspace.",
      "account_deleted",
      410,
    );
  }
  if (!response.ok) {
    throw new PlanError(
      "Zoption could not read your plan. Try again shortly.",
      "unreachable",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PlanError(
      "The workspace service returned an invalid response.",
      "invalid_response",
      response.status,
    );
  }

  const parsed = billingSummarySchema.safeParse(payload);
  if (!parsed.success) {
    throw new PlanError(
      "The workspace service returned an invalid response.",
      "invalid_response",
      response.status,
    );
  }

  return parsed.data.plan;
}
