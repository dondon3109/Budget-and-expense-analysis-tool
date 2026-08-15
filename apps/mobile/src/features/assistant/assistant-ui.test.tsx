import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  AssistantConsentCard,
  AssistantIdentityCard,
  AssistantMessageBubble,
  AssistantThreadRow,
  AssistantUpgradeBanner,
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

  it("labels thread rows and their delete control separately", async () => {
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
    const del = screen.getByRole("button", { name: "Delete conversation Where does my money go?" });
    await fireEvent.press(del);
    expect(onDelete).toHaveBeenCalled();
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
