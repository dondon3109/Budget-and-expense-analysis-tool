import { z } from "zod";

import { publicConfig } from "@/config/public-config";

const workerIdentitySchema = z
  .object({
    user: z
      .object({
        id: z.string().uuid(),
        email: z.string().email().optional(),
        role: z.string().optional(),
      })
      .strict(),
    tenantId: z.string().min(1),
  })
  .strict();

export type WorkerIdentityErrorCode =
  "session_expired" | "account_deleted" | "identity_mismatch" | "unreachable" | "invalid_response";

export class WorkerIdentityError extends Error {
  constructor(
    message: string,
    readonly code: WorkerIdentityErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkerIdentityError";
  }
}

export async function verifyWorkerIdentity({
  subject,
  accessToken,
  signal,
  fetchImpl = fetch,
}: {
  subject: string;
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(new URL("/api/app/me", publicConfig.apiUrl), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new WorkerIdentityError(
      "Zoption could not reach your workspace. Check your connection and try again.",
      "unreachable",
      0,
    );
  }

  if (response.status === 401) {
    throw new WorkerIdentityError(
      "Your session expired. Sign in again to open your workspace.",
      "session_expired",
      401,
    );
  }
  if (response.status === 410) {
    throw new WorkerIdentityError(
      "This Zoption account has been deleted and cannot open a workspace.",
      "account_deleted",
      410,
    );
  }
  if (!response.ok) {
    throw new WorkerIdentityError(
      "Zoption could not verify your workspace. Try again shortly.",
      "unreachable",
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new WorkerIdentityError(
      "The workspace service returned an invalid response.",
      "invalid_response",
      response.status,
    );
  }

  const parsed = workerIdentitySchema.safeParse(payload);
  if (!parsed.success) {
    throw new WorkerIdentityError(
      "The workspace service returned an invalid response.",
      "invalid_response",
      response.status,
    );
  }

  // The Worker derives this mapping after verifying the bearer token. Mobile
  // never sends a tenant ID and never treats the returned value as authority.
  if (parsed.data.user.id !== subject || parsed.data.tenantId !== `user:${subject}`) {
    throw new WorkerIdentityError(
      "The signed-in identity does not match the financial workspace.",
      "identity_mismatch",
      response.status,
    );
  }
}
