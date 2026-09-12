import { fireEvent, render, screen } from "@testing-library/react-native";
import { VoicePreviewCard, type VoicePreviewDraftSummary } from "./VoicePreviewCard";

const sampleDraft: VoicePreviewDraftSummary = {
  amountMinor: 15000,
  currency: "PHP",
  description: "Starbucks Coffee",
  categoryName: "Food & Dining",
  accountName: "Cash Wallet",
};

describe("VoicePreviewCard", () => {
  it("renders draft details, countdown text, and the two action buttons", async () => {
    const onEdit = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={3}
        onEdit={onEdit}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Starbucks Coffee")).toBeTruthy();
    expect(screen.getByText("Food & Dining · Cash Wallet")).toBeTruthy();
    expect(screen.getByText("Saving in 3s...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("updates countdown text when remaining seconds tick down", async () => {
    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={1}
        onEdit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Saving in 1s...")).toBeTruthy();
  });

  it("renders saving state text", async () => {
    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={0}
        saving
        onEdit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Saving...")).toBeTruthy();
  });

  it("surfaces error message when save fails", async () => {
    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={0}
        error="Could not save to local storage"
        onEdit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("Could not save to local storage")).toBeTruthy();
  });

  it("triggers onEdit when Edit button is pressed", async () => {
    const onEdit = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={3}
        onEdit={onEdit}
        onCancel={onCancel}
      />,
    );

    const editBtn = screen.getByRole("button", { name: "Edit" });
    fireEvent.press(editBtn);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("triggers onCancel when Cancel button is pressed", async () => {
    const onEdit = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoicePreviewCard
        draft={sampleDraft}
        remainingSeconds={3}
        onEdit={onEdit}
        onCancel={onCancel}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.press(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
