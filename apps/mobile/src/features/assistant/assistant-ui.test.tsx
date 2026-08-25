import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  AssistantConsentCard,
  AssistantIdentityCard,
  AssistantMessageBubble,
  AssistantStatusBadge,
  AssistantThreadRow,
  AssistantUnavailableView,
  AssistantUpgradeBanner,
  formatRecordingElapsed,
  VoiceModelField,
  VoiceRecordButton,
} from "./assistant-ui";

describe("assistant accessibility-critical interactions", () => {
  it("exposes the consent heading and a working accept button", async () => {
    const onAccept = jest.fn();
    await render(<AssistantConsentCard retentionDays={90} accepting={false} onAccept={onAccept} />);
    expect(screen.getByRole("header", { name: "Your data, your boundaries." })).toBeTruthy();
    const accept = screen.getByRole("button", { name: "Accept and continue" });
    await fireEvent.press(accept);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("blocks the identity save until both names are valid", async () => {
    const onSave = jest.fn();
    await render(
      <AssistantIdentityCard
        assistantName=""
        userPreferredName=""
        saving={false}
        onSave={onSave}
      />,
    );
    const save = screen.getByRole("button", { name: "Save and continue" });
    expect(save).toBeDisabled();
  });

  it("opens a conversation on tap and keeps delete off the default row", async () => {
    const onOpen = jest.fn();
    const onDelete = jest.fn();
    await render(
      <AssistantThreadRow
        title="Where does my money go?"
        lastMessageAt="2026-05-01T08:00:00.000Z"
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );
    const row = screen.getByRole("button", { name: /Conversation Where does my money go/ });
    await fireEvent.press(row);
    expect(onOpen).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Delete conversation Where does my money go?" }),
    ).toBeNull();
  });

  it("deletes only after a long press or an explicit manage-mode action", async () => {
    const onOpen = jest.fn();
    const onDelete = jest.fn();
    const { rerender } = await render(
      <AssistantThreadRow
        title="Where does my money go?"
        lastMessageAt="2026-05-01T08:00:00.000Z"
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );
    const row = screen.getByRole("button", { name: /Conversation Where does my money go/ });
    await fireEvent(row, "longPress");
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();

    await rerender(
      <AssistantThreadRow
        title="Where does my money go?"
        lastMessageAt="2026-05-01T08:00:00.000Z"
        managing
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );
    const del = screen.getByRole("button", { name: "Delete conversation Where does my money go?" });
    await fireEvent.press(del);
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("offers spoken replies only when a listener exists", async () => {
    await render(
      <AssistantMessageBubble
        role="assistant"
        content="Most of May went to food."
        status="completed"
        createdAt="2026-05-01T08:00:00.000Z"
      />,
    );
    expect(screen.queryByRole("button", { name: "Play spoken reply" })).toBeNull();
    const onListen = jest.fn();
    await render(
      <AssistantMessageBubble
        role="assistant"
        content="Most of May went to food."
        status="completed"
        createdAt="2026-05-01T08:00:00.000Z"
        onListen={onListen}
      />,
    );
    const play = screen.getByRole("button", { name: "Play spoken reply" });
    await fireEvent.press(play);
    expect(onListen).toHaveBeenCalled();
  });

  it("marks failed assistant answers honestly", async () => {
    await render(
      <AssistantMessageBubble
        role="assistant"
        content=""
        status="failed"
        createdAt="2026-05-01T08:00:00.000Z"
      />,
    );
    expect(screen.getByText("Not sent. Try asking again.")).toBeTruthy();
  });

  it("keeps the plan-limit banner actionable", async () => {
    const onReviewPlan = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <AssistantUpgradeBanner
        message="No AI questions remaining this cycle."
        onReviewPlan={onReviewPlan}
        onDismiss={onDismiss}
      />,
    );
    const review = screen.getByRole("button", { name: "Review Plan" });
    await fireEvent.press(review);
    expect(onReviewPlan).toHaveBeenCalled();
  });
});

describe("voice record button states", () => {
  it("formats recording elapsed time as minutes and seconds", () => {
    expect(formatRecordingElapsed(0)).toBe("0:00");
    expect(formatRecordingElapsed(7)).toBe("0:07");
    expect(formatRecordingElapsed(83)).toBe("1:23");
    expect(formatRecordingElapsed(-2)).toBe("0:00");
  });

  it("shows a microphone and is enabled while idle", async () => {
    const onPress = jest.fn();
    await render(<VoiceRecordButton phase="idle" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Record voice question" });
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the microphone visible and names the stop action while recording", async () => {
    const onPress = jest.fn();
    await render(<VoiceRecordButton phase="recording" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Stop and transcribe" });
    expect(button).toBeEnabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disables the control with an explicit label while transcribing", async () => {
    const onPress = jest.fn();
    await render(<VoiceRecordButton phase="transcribing" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Transcribing your question" });
    expect(button).toBeDisabled();
  });

  it("disables the control while requesting microphone permission", async () => {
    const onPress = jest.fn();
    await render(<VoiceRecordButton phase="requesting" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Allowing microphone access" });
    expect(button).toBeDisabled();
  });
});

describe("voice model selection", () => {
  it("uses the same labelled voice choices as the website and previews the selection", async () => {
    const onSelect = jest.fn();
    const onPreview = jest.fn();
    await render(
      <VoiceModelField
        voice="bright"
        disabled={false}
        previewingVoice={null}
        previewError={null}
        onSelect={onSelect}
        onPreview={onPreview}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Voice and gender, Bright · Female/ }),
    ).toBeTruthy();
    expect(screen.getByText("A bright, lively female voice.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Preview Bright voice" }));
    expect(onPreview).toHaveBeenCalledWith("bright");

    await fireEvent.press(screen.getByRole("button", { name: /Voice and gender/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "Energetic · Female" }));
    expect(onSelect).toHaveBeenCalledWith("energetic");
  });
});

describe("assistant status and unavailable UI", () => {
  it("renders status badges for available, offline, and custom labels", async () => {
    const { rerender } = await render(<AssistantStatusBadge status="available" />);
    expect(screen.getByText("Available")).toBeTruthy();

    await rerender(<AssistantStatusBadge status="offline" />);
    expect(screen.getByText("Offline")).toBeTruthy();

    await rerender(<AssistantStatusBadge status="available" label="Connected · Read-only" />);
    expect(screen.getByText("Connected · Read-only")).toBeTruthy();
  });

  it("renders offline and server unavailable states with retry and fallback actions", async () => {
    const onRetry = jest.fn();
    const onOpenTransactions = jest.fn();
    const onOpenBudgets = jest.fn();

    const { rerender } = await render(
      <AssistantUnavailableView
        isOffline
        onRetry={onRetry}
        onOpenTransactions={onOpenTransactions}
        onOpenBudgets={onOpenBudgets}
      />,
    );

    expect(screen.getByRole("header", { name: "AI Assistant is offline" })).toBeTruthy();
    expect(screen.getByText("Available offline features")).toBeTruthy();

    const retry = screen.getByRole("button", { name: "Check connection & retry" });
    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const txButton = screen.getByRole("button", { name: "View transactions" });
    await fireEvent.press(txButton);
    expect(onOpenTransactions).toHaveBeenCalledTimes(1);

    await rerender(
      <AssistantUnavailableView
        isOffline={false}
        errorMessage="Custom gateway error"
        onRetry={onRetry}
        onOpenTransactions={onOpenTransactions}
        onOpenBudgets={onOpenBudgets}
      />,
    );

    expect(screen.getByRole("header", { name: "AI Assistant is unavailable" })).toBeTruthy();
    expect(screen.getByText("Custom gateway error")).toBeTruthy();
  });
});
