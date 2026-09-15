import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AssistantScreen } from "./AssistantScreen";

// Focused guard for the mobile chat-history Select button: it must turn rows
// into checkboxes and delete only the conversations the user picked.

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

// The screen's load effects depend on the session object identity, so the mock
// must return the same one on every render instead of a fresh literal.
jest.mock("@/auth/session-state", () => {
  const session = {
    status: "signed-in",
    subject: "user-1",
    getAccessToken: jest.fn().mockResolvedValue("access-token"),
  };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/api/assistant", () => ({
  ApiTransportError: jest.requireActual("@/api/assistant").ApiTransportError,
  clearAssistantMemory: jest.fn(),
  createAssistantThreadTurn: jest.fn(),
  deleteAllAssistantThreads: jest.fn(),
  deleteAssistantMemory: jest.fn(),
  deleteAssistantThread: jest.fn(),
  getAssistantMemory: jest.fn(),
  getAssistantMemoryPreferences: jest.fn(),
  getAssistantPreferences: jest.fn(),
  listAssistantMessages: jest.fn(),
  listAssistantThreads: jest.fn(),
  sendAssistantTurn: jest.fn(),
  updateAssistantMemory: jest.fn(),
  updateAssistantMemoryPreferences: jest.fn(),
  updateAssistantPreferences: jest.fn(),
}));

jest.mock("@/api/assistant-voice", () => ({
  getAssistantVoicePreferences: jest.fn(),
  grantAssistantVoiceConsent: jest.fn(),
}));

jest.mock("./assistant-voice-hooks", () => {
  const recorder = {
    phase: "idle",
    elapsedSeconds: 0,
    liveStatus: "available",
    startRecording: jest.fn(),
    stopAndTranscribe: jest.fn(),
  };
  return { useAssistantRecorder: () => recorder };
});

const voiceApi = jest.requireMock("@/api/assistant-voice") as {
  getAssistantVoicePreferences: jest.Mock;
};

const api = jest.requireMock("@/api/assistant") as {
  clearAssistantMemory: jest.Mock;
  deleteAssistantMemory: jest.Mock;
  deleteAssistantThread: jest.Mock;
  getAssistantMemory: jest.Mock;
  getAssistantMemoryPreferences: jest.Mock;
  getAssistantPreferences: jest.Mock;
  getAssistantVoicePreferences?: jest.Mock;
  listAssistantMessages: jest.Mock;
  listAssistantThreads: jest.Mock;
};

const threads = [
  {
    id: "thread-1",
    title: "Budget review",
    kind: "text",
    lastMessageAt: "2026-08-12T10:00:00.000Z",
    createdAt: "2026-08-12T10:00:00.000Z",
  },
  {
    id: "thread-2",
    title: "Cashflow check",
    kind: "text",
    lastMessageAt: "2026-08-11T10:00:00.000Z",
    createdAt: "2026-08-11T10:00:00.000Z",
  },
];

describe("assistant screen multi-select", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getAssistantPreferences.mockResolvedValue({
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 5,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
    voiceApi.getAssistantVoicePreferences.mockResolvedValue({
      enabled: true,
      speechAvailable: true,
      reviewRequired: false,
      consentedAt: "2026-08-12T10:00:00.000Z",
      consentVersion: 3,
      transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
      ttsModel: "s2.1-pro-free",
    });
    api.listAssistantThreads.mockResolvedValue({ items: threads, nextCursor: null });
    api.listAssistantMessages.mockResolvedValue({ items: [], nextCursor: null });
    api.deleteAssistantThread.mockResolvedValue(undefined);
  });

  it("deletes every selected conversation in one pass", async () => {
    await render(<AssistantScreen />);

    await screen.findByText("Budget review");
    await fireEvent.press(screen.getByRole("button", { name: "Select conversations" }));

    const first = screen.getByRole("checkbox", { name: /Conversation Budget review/ });
    const second = screen.getByRole("checkbox", { name: /Conversation Cashflow check/ });
    await fireEvent.press(first);
    await fireEvent.press(second);

    expect(screen.getByText("2 selected")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete selected (2)" }));

    expect(screen.getByRole("header", { name: "Delete 2 conversations?" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Budget review")).toBeNull());
    expect(screen.queryByText("Cashflow check")).toBeNull();
    expect(api.deleteAssistantThread).toHaveBeenCalledTimes(2);
    expect(api.deleteAssistantThread).toHaveBeenCalledWith(
      { accessToken: "access-token" },
      "thread-1",
    );
    expect(api.deleteAssistantThread).toHaveBeenCalledWith(
      { accessToken: "access-token" },
      "thread-2",
    );
  });

  it("confirms before clearing memory and resets the payoff control", async () => {
    api.getAssistantMemory.mockResolvedValue([
      {
        id: "mem-1",
        kind: "fact",
        key: "monthly_budget_cap",
        value: "Monthly budget PHP 30,000",
        source: "user_stated",
        createdAt: "2026-08-15T08:00:00.000Z",
        updatedAt: "2026-08-15T08:00:00.000Z",
      },
    ]);
    api.getAssistantMemoryPreferences.mockResolvedValue({
      debtStrategy: "avalanche",
      responseDetail: "concise",
      coachingStyle: "direct",
    });
    api.clearAssistantMemory.mockResolvedValue(undefined);

    await render(<AssistantScreen />);
    await screen.findByText("Budget review");
    await fireEvent.press(screen.getByRole("button", { name: "Assistant settings" }));

    expect(await screen.findByText("Avalanche")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear memory" }));

    // Clearing is destructive, so it asks first, like the web panel does.
    expect(api.clearAssistantMemory).not.toHaveBeenCalled();
    expect(screen.getByRole("header", { name: "Clear all assistant memory?" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Yes, clear memory" }));

    await waitFor(() =>
      expect(api.clearAssistantMemory).toHaveBeenCalledWith({ accessToken: "access-token" }),
    );
    await waitFor(() => expect(screen.queryByText("Monthly budget PHP 30,000")).toBeNull());
    expect(screen.getByText("No preference")).toBeTruthy();
  });

  it("deletes a single remembered fact after confirmation", async () => {
    api.getAssistantMemory.mockResolvedValue([
      {
        id: "mem-1",
        kind: "fact",
        key: "monthly_budget_cap",
        value: "Monthly budget PHP 30,000",
        source: "user_stated",
        createdAt: "2026-08-15T08:00:00.000Z",
        updatedAt: "2026-08-15T08:00:00.000Z",
      },
    ]);
    api.getAssistantMemoryPreferences.mockResolvedValue({
      debtStrategy: null,
      responseDetail: "concise",
      coachingStyle: "direct",
    });
    api.deleteAssistantMemory.mockResolvedValue(undefined);

    await render(<AssistantScreen />);
    await screen.findByText("Budget review");
    await fireEvent.press(screen.getByRole("button", { name: "Assistant settings" }));

    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Delete remembered fact: Monthly budget PHP 30,000",
      }),
    );
    expect(screen.getByRole("header", { name: "Delete this memory?" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(api.deleteAssistantMemory).toHaveBeenCalledWith(
        { accessToken: "access-token" },
        "mem-1",
      ),
    );
    await waitFor(() => expect(screen.queryByText("Monthly budget PHP 30,000")).toBeNull());
  });
});
