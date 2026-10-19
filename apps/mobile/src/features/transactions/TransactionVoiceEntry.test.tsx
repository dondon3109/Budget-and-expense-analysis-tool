import { render, screen, waitFor } from "@testing-library/react-native";

import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { TransactionVoiceEntry } from "./TransactionVoiceEntry";

jest.mock("@/api/receipt-scan", () => ({
  getReceiptPreferences: jest.fn(async () => ({
    enabled: true,
    consentedAt: "2026-08-01T00:00:00Z",
    consentVersion: 2,
    visionModel: "gemini-flash",
  })),
  grantReceiptConsent: jest.fn(async () => ({
    enabled: true,
    consentedAt: "2026-08-01T00:00:00Z",
    consentVersion: 2,
    visionModel: "gemini-flash",
  })),
}));

jest.mock("@/auth/session-state", () => {
  const session = {
    status: "signed-in",
    subject: "user-1",
    getAccessToken: jest.fn().mockResolvedValue("mock-token"),
  };
  return { useSessionSnapshot: () => session };
});

const mockRecorder = {
  phase: "idle",
  elapsedSeconds: 0,
  liveStatus: "idle",
  startRecording: jest.fn(),
  stopAndTranscribe: jest.fn(),
  cancelRecording: jest.fn(),
};

let capturedRecorderOptions: any = null;

jest.mock("@/features/assistant/assistant-voice-hooks", () => ({
  useVoiceRecorder: (options: any) => {
    capturedRecorderOptions = options;
    return mockRecorder;
  },
}));

describe("TransactionVoiceEntry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("records in the voice language chosen in Settings", async () => {
    useVoiceLanguageStore.setState({ language: "fil" });
    render(<TransactionVoiceEntry onDraft={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Speak a transaction")).toBeTruthy();
    });
    expect(capturedRecorderOptions.language).toBe("fil");
  });
});
