import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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

describe("TransactionVoiceEntry language support", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVoiceLanguageStore.setState({ language: "auto" });
  });

  it("renders voice language toggles with Auto as default", async () => {
    render(<TransactionVoiceEntry onDraft={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Auto voice language")).toBeTruthy();
    });

    expect(screen.getByLabelText("English voice language")).toBeTruthy();
    expect(screen.getByLabelText("Tagalog voice language")).toBeTruthy();

    expect(screen.getByLabelText("Auto voice language").props.accessibilityState?.selected).toBe(
      true,
    );
    expect(capturedRecorderOptions.language).toBe("auto");
    expect(
      screen.getByText(/Try “Spent 250 pesos on lunch today” or “Gumastos ng 250 kahapon”/),
    ).toBeTruthy();
  });

  it("switches language to Tagalog and updates helper guidance", async () => {
    render(<TransactionVoiceEntry onDraft={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Tagalog voice language")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Tagalog voice language"));
    });

    expect(useVoiceLanguageStore.getState().language).toBe("fil");
    await waitFor(() => {
      expect(
        screen.getByText(/Subukan: “Gumastos ng 250 pesos sa tanghalian kanina.”/),
      ).toBeTruthy();
    });
  });

  it("switches language to English and updates helper guidance", async () => {
    render(<TransactionVoiceEntry onDraft={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText("English voice language")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("English voice language"));
    });

    expect(useVoiceLanguageStore.getState().language).toBe("en");
    await waitFor(() => {
      expect(
        screen.getByText(
          /Try “Spent 250 pesos on lunch today.” Nothing saves until you review this form./,
        ),
      ).toBeTruthy();
    });
  });
});
