import {
  bugReportResponseSchema,
  supportChatResponseSchema,
  type BugReport,
  type BugReportCreateInput,
  type BugReportDraft,
} from "@zoption/shared";
import { z } from "zod";

import { publicConfig } from "@/config/public-config";

import { ApiTransportError, apiRequest, mapApiError } from "./authenticated";

export interface SupportApi {
  accessToken?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface SupportChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

export interface SupportChatResult {
  message: string;
  bugReportDraft?: BugReportDraft;
}

const supportFallback = "Zoption Support could not be reached. Try again shortly.";

/**
 * The public support chat must not carry an Authorization header, so it takes
 * its own fetch path. The authenticated path goes through apiRequest.
 */
export async function completeSupportChat(
  api: SupportApi,
  input: { messages: SupportChatMessage[]; pageContext: SupportPageContext },
): Promise<SupportChatResult> {
  if (api.accessToken === undefined) {
    let response: Response;
    try {
      response = await (api.fetchImpl ?? fetch)(
        publicConfig.apiUrl + "/api/support/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: api.signal,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ApiTransportError(
        "Zoption could not be reached. Connect to the internet and retry.",
        "network",
        0,
      );
    }
    if (!response.ok) {
      throw mapApiError(
        response.status,
        (await response.json().catch(() => ({}))) as never,
        supportFallback,
      );
    }
    return supportChatResponseSchema.parse(await response.json());
  }
  return apiRequest({
    accessToken: api.accessToken,
    signal: api.signal,
    fetchImpl: api.fetchImpl,
    path: "/api/app/support/chat",
    method: "POST",
    body: input,
    fallback: supportFallback,
    decode: (value) => supportChatResponseSchema.parse(value),
  });
}

export function createBugReport(
  api: SupportApi & { accessToken: string },
  input: BugReportCreateInput,
): Promise<BugReport> {
  return apiRequest({
    ...api,
    path: "/api/app/support/bug-reports",
    method: "POST",
    body: input,
    fallback: "The bug report could not be submitted. Try again shortly.",
    decode: (value) => bugReportResponseSchema.parse(value),
  });
}

const bugReportListSchema = z.array(bugReportResponseSchema).max(200);

export function listBugReports(
  api: SupportApi & { accessToken: string },
): Promise<BugReport[]> {
  return apiRequest({
    ...api,
    path: "/api/app/support/bug-reports",
    method: "GET",
    fallback: "Bug reports could not be loaded. Try again shortly.",
    decode: (value) => bugReportListSchema.parse(value),
  });
}

export function getBugReport(
  api: SupportApi & { accessToken: string },
  id: string,
): Promise<BugReport> {
  return apiRequest({
    ...api,
    path: "/api/app/support/bug-reports/" + encodeURIComponent(id),
    method: "GET",
    fallback: "The bug report could not be loaded. Try again shortly.",
    decode: (value) => bugReportResponseSchema.parse(value),
  });
}

export { ApiTransportError };

export type { BugReport, BugReportCreateInput };
