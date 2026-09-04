import type { AssistantPreferences } from "@zoption/shared";

import {
  CURRENT_CONSENT_VERSION,
  formatThreadTime,
  MAX_ASSISTANT_MESSAGE_LENGTH,
  requiresAssistantConsent,
  requiresIdentitySetup,
  resolveAssistantThreadView,
  suggestedThreadTitle,
  threadSectionTitle,
  validateAssistantMessage,
  validateIdentityName,
} from "./assistant-forms";

function preferences(overrides: Partial<AssistantPreferences> = {}): AssistantPreferences {
  return {
    consentedAt: "2026-05-01T08:00:00.000Z",
    consentVersion: CURRENT_CONSENT_VERSION,
    retentionDays: 90,
    assistantName: "Zoe",
    userPreferredName: "Don",
    responseDetail: "concise",
    coachingStyle: "gentle",
    ...overrides,
  };
}

describe("assistant form helpers", () => {
  it("gates consent on a missing or outdated consent record", () => {
    expect(requiresAssistantConsent(null)).toBe(true);
    expect(requiresAssistantConsent(preferences({ consentedAt: null }))).toBe(true);
    expect(requiresAssistantConsent(preferences({ consentVersion: 4 }))).toBe(true);
    expect(requiresAssistantConsent(preferences())).toBe(false);
  });

  it("requires identity setup only when names are missing", () => {
    expect(requiresIdentitySetup(preferences())).toBe(false);
    expect(requiresIdentitySetup(preferences({ assistantName: null }))).toBe(true);
    expect(requiresIdentitySetup(preferences({ userPreferredName: null }))).toBe(true);
    expect(requiresIdentitySetup(null)).toBe(false);
  });

  it("validates identity names with the shared schema copy", () => {
    expect(validateIdentityName("Zoe")).toBe(null);
    expect(validateIdentityName("")).toMatch(/Enter a name/);
    expect(validateIdentityName("line\nbreak")).toMatch(/control characters|line breaks/);
    expect(validateIdentityName("x".repeat(90))).toMatch(/80 characters/);
  });

  it("validates assistant messages with the shared input schema", () => {
    expect(validateAssistantMessage("Where does my money go?")).toBe(null);
    expect(validateAssistantMessage("   ")).toMatch(/Enter a question/);
    expect(validateAssistantMessage("x".repeat(MAX_ASSISTANT_MESSAGE_LENGTH + 1))).toMatch(/2,000 characters/);
  });

  it("groups threads by recency", () => {
    const now = new Date();
    const today = now.toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(threadSectionTitle(today)).toBe("Today");
    expect(threadSectionTitle(threeDaysAgo)).toBe("Previous 7 days");
    expect(threadSectionTitle(monthAgo)).toBe("Older");
  });

  it("formats thread timestamps and suggested titles", () => {
    const iso = new Date().toISOString();
    expect(formatThreadTime(iso)).toMatch(/\d{1,2}:\d{2}/);
    expect(formatThreadTime("not-a-date")).toBe("");
    expect(suggestedThreadTitle("short question")).toBe("short question");
    expect(suggestedThreadTitle("x".repeat(60))).toHaveLength(48);
  });

  it("routes voice history back to the voice UI", () => {
    expect(resolveAssistantThreadView("voice")).toBe("voice");
  });

  it("keeps text history in the text chat UI", () => {
    expect(resolveAssistantThreadView("text")).toBe("chat");
    expect(resolveAssistantThreadView(null)).toBe("chat");
    expect(resolveAssistantThreadView(undefined)).toBe("chat");
  });
});
