import * as Crypto from "expo-crypto";
import {
  assistantIdentityNameSchema,
  assistantMessageInputSchema,
  type AssistantPreferences,
} from "@zoption/shared";

// Mirrors the server's consent gate: the Worker refuses turns until consent is
// granted at the current version, so the client surfaces the same gate first.
export const CURRENT_CONSENT_VERSION = 5;

export const MAX_ASSISTANT_MESSAGE_LENGTH = 2000;
export const MAX_IDENTITY_NAME_LENGTH = 80;

export function requiresAssistantConsent(
  preferences: AssistantPreferences | null,
): boolean {
  return (
    preferences === null ||
    preferences.consentedAt === null ||
    preferences.consentVersion !== CURRENT_CONSENT_VERSION
  );
}

export function requiresIdentitySetup(
  preferences: AssistantPreferences | null,
): boolean {
  if (preferences === null) return false;
  return (
    preferences.assistantName === null || preferences.userPreferredName === null
  );
}

export function validateIdentityName(value: string): string | null {
  const parsed = assistantIdentityNameSchema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue ? issue.message : "Enter a valid name.";
}

export function validateAssistantMessage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Enter a question first.";
  if (trimmed.length > MAX_ASSISTANT_MESSAGE_LENGTH) {
    return "Keep your message to 2,000 characters or fewer.";
  }
  const parsed = assistantMessageInputSchema.safeParse({
    message: trimmed,
    clientRequestId: "00000000-0000-4000-8000-000000000000",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues.find(
      (candidate) => candidate.path[0] === "message",
    );
    return issue ? issue.message : "Enter a valid message.";
  }
  return null;
}

export function newClientRequestId(): string {
  return Crypto.randomUUID();
}

export function threadSectionTitle(lastMessageAt: string): "Today" | "Previous 7 days" | "Older" {
  const timestamp = Date.parse(lastMessageAt);
  if (Number.isNaN(timestamp)) return "Older";
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const age = now - timestamp;
  if (timestamp >= startOfToday.getTime()) return "Today";
  if (age <= 7 * 24 * 60 * 60 * 1000) return "Previous 7 days";
  return "Older";
}

export function formatThreadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function suggestedThreadTitle(message: string): string {
  const clean = message.replace(/\s+/gu, " ").trim();
  if (clean.length <= 48) return clean;
  return clean.slice(0, 47).trimEnd() + "…";
}
