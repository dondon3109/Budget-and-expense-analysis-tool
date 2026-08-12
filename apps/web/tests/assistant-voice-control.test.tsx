// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "../src/components/assistant/AssistantVoiceControl";

const apiMocks = vi.hoisted(() => ({
  getAssistantVoicePreferences: vi.fn(),
  grantAssistantVoiceConsent: vi.fn(),
  transcribeAssistantVoice: vi.fn(),
}));

vi.mock("../src/lib/api", () => apiMocks);

const workspace = { key: "user:test-user" as const, userId: "test-user" };

beforeEach(() => {
  apiMocks.getAssistantVoicePreferences.mockResolvedValue({
    enabled: true,
    reviewRequired: true,
    consentedAt: null,
    consentVersion: 0,
    ttsModel: "s2.1-pro-free",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AssistantVoiceControl", () => {
  it("shows the provider disclosure before requesting microphone access", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );

    await waitFor(() => expect(apiMocks.getAssistantVoicePreferences).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));

    const notice = screen.getByRole("dialog", { name: "Voice preview notice" });
    expect(notice).toHaveFocus();
    expect(notice).toHaveTextContent("sent to Fish Audio");
    expect(notice).toHaveTextContent("transcription may incur usage charges");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(apiMocks.grantAssistantVoiceConsent).not.toHaveBeenCalled();
  });

  it("closes the disclosure with Escape and restores microphone focus", async () => {
    render(
      <AssistantVoiceControl
        workspace={workspace}
        disabled={false}
        reviewRequired
        onTranscript={vi.fn()}
      />,
    );
    const microphone = screen.getByRole("button", { name: "Start voice recording" });
    fireEvent.click(microphone);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Voice preview notice" })).not.toBeInTheDocument();
    expect(microphone).toHaveFocus();
  });
});
