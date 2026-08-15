import Constants from "expo-constants";
import {
  bugReportDraftSchema,
  type BugReportDiagnostics,
  type BugReportDraft,
} from "@zoption/shared";
import { Dimensions, Platform } from "react-native";

import type { SupportChatMessage } from "@/api/support";

export const MAX_SUPPORT_MESSAGE_LENGTH = 1200;
export const MAX_SUPPORT_HISTORY_MESSAGES = 12;

// Mirrors the Worker's support chat schema locally: roles must alternate
// sanely, content stays within 1..1200 characters, the history stays within
// the 12-message cap, and the final message must come from the user.
export function isValidSupportHistory(messages: SupportChatMessage[]): boolean {
  if (messages.length === 0 || messages.length > MAX_SUPPORT_HISTORY_MESSAGES) return false;
  if (messages.some((message) => message.role !== "user" && message.role !== "assistant")) {
    return false;
  }
  if (messages.some((message) => {
    const length = message.content.trim().length;
    return length < 1 || length > MAX_SUPPORT_MESSAGE_LENGTH;
  })) {
    return false;
  }
  return messages.at(-1)?.role === "user";
}

// The support chat body must end with a user message and stay within the
// Worker's history cap, so the client trims and validates before sending.
export function prepareSupportHistory(
  messages: SupportChatMessage[],
  nextUserMessage: string,
): SupportChatMessage[] {
  const trimmed = messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-(MAX_SUPPORT_HISTORY_MESSAGES - 1));
  const history: SupportChatMessage[] = [
    ...trimmed,
    { role: "user", content: nextUserMessage },
  ];
  return isValidSupportHistory(history) ? history : [];
}

export function validateSupportMessage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Enter a message first.";
  if (trimmed.length > MAX_SUPPORT_MESSAGE_LENGTH) {
    return "Keep your message to 1,200 characters or fewer.";
  }
  return null;
}

export function buildBugDiagnostics(route: string): BugReportDiagnostics {
  const window = Dimensions.get("window");
  const releaseVersion =
    typeof Constants.expoConfig?.version === "string" && Constants.expoConfig.version.length > 0
      ? Constants.expoConfig.version
      : "dev";
  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "other";
  return {
    route,
    releaseVersion,
    viewportWidth: Math.round(window.width),
    viewportHeight: Math.round(window.height),
    displayMode: "standalone",
    platform,
  };
}

export function validateBugDraft(draft: BugReportDraft): string | null {
  const parsed = bugReportDraftSchema.safeParse(draft);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue ? issue.message : "Review the report fields.";
}
