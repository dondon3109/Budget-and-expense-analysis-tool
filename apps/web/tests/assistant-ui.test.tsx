// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantComposer } from "../src/components/assistant/AssistantComposer";
import { AssistantConsent } from "../src/components/assistant/AssistantConsent";
import { AssistantConversation } from "../src/components/assistant/AssistantConversation";

afterEach(cleanup);

describe("assistant UI", () => {
  it("requires an explicit consent action", () => {
    const accept = vi.fn();
    render(<AssistantConsent accepting={false} onAccept={accept} />);
    expect(screen.getByText(/only the financial data needed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(accept).toHaveBeenCalledOnce();
  });

  it("renders model output as text instead of HTML", () => {
    render(
      <AssistantConversation
        messages={[
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content: '<img src=x onerror="alert(1)">',
            status: "completed",
            createdAt: "2026-07-27T10:00:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("uses Enter to send and Shift+Enter for a new line", () => {
    const send = vi.fn();
    render(
      <AssistantComposer
        value="How much did I spend?"
        busy={false}
        onChange={() => undefined}
        onSend={send}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Ask about your finances" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(send).toHaveBeenCalledOnce();
  });
});
