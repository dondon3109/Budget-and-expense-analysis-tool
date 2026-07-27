// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  deleteAllAssistantThreads: vi.fn(),
  deleteAssistantThread: vi.fn(),
  getAssistantMessages: vi.fn(),
  getAssistantPreferences: vi.fn(),
  getAssistantThreads: vi.fn(),
  updateAssistantIdentity: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { AssistantSessionProvider } from "../src/assistant/AssistantSessionProvider";
import { AssistantComposer } from "../src/components/assistant/AssistantComposer";
import { AssistantConsent } from "../src/components/assistant/AssistantConsent";
import { AssistantConversation } from "../src/components/assistant/AssistantConversation";
import { AssistantPage } from "../src/pages/AssistantPage";
import { queryKeys } from "../src/lib/queryKeys";

const thread = {
  id: "thread-1",
  title: "Budget review",
  lastMessageAt: "2026-07-27T10:00:00.000Z",
  createdAt: "2026-07-27T10:00:00.000Z",
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function renderPage() {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AssistantSessionProvider>
        <AssistantPage />
      </AssistantSessionProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

function AssistantRouteHarness() {
  const [route, setRoute] = useState<"assistant" | "calendar">("assistant");

  return (
    <>
      <button type="button" onClick={() => setRoute("assistant")}>
        Assistant tab
      </button>
      <button type="button" onClick={() => setRoute("calendar")}>
        Calendar tab
      </button>
      {route === "assistant" ? <AssistantPage /> : <p>Calendar page</p>}
    </>
  );
}

function renderRouteHarness() {
  const queryClient = createQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AssistantSessionProvider>
        <AssistantRouteHarness />
      </AssistantSessionProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

afterEach(cleanup);

describe("assistant UI", () => {
  beforeEach(() => {
    apiMocks.deleteAllAssistantThreads.mockReset();
    apiMocks.deleteAssistantThread.mockReset();
    apiMocks.getAssistantMessages.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    apiMocks.getAssistantPreferences.mockReset().mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
    });
    apiMocks.updateAssistantIdentity.mockReset();
    apiMocks.getAssistantThreads.mockReset().mockResolvedValue({
      items: [thread],
      nextCursor: null,
    });
  });

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
        assistantName="Aster"
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

  it("uses the new assistant message with MONEY emphasized", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Your MONEY, explained." })).toBeInTheDocument();
    expect(screen.getByText("Ask anything. Zoption already knows the numbers.")).toBeInTheDocument();
    expect(screen.getByText("MONEY")).toHaveClass("assistant-heading-emphasis");
  });

  it("requires assistant and user names after consent, then displays the saved assistant name", async () => {
    apiMocks.getAssistantPreferences.mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      retentionDays: 90,
      assistantName: null,
      userPreferredName: null,
    });
    apiMocks.updateAssistantIdentity.mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
    });
    renderPage();

    expect(await screen.findByRole("dialog", { name: "Make this assistant yours" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close assistant name editor" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your assistant's name"), { target: { value: "Aster" } });
    fireEvent.change(screen.getByLabelText("What should your assistant call you?"), {
      target: { value: "Sam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(apiMocks.updateAssistantIdentity).toHaveBeenCalledWith(
        expect.anything(),
        { assistantName: "Aster", userPreferredName: "Sam" },
      ),
    );
    expect(await screen.findByRole("heading", { name: "Chats with Aster" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit assistant names" }));
    expect(await screen.findByRole("dialog", { name: "Edit assistant names" })).toBeInTheDocument();
  });

  it("restores the active chat and draft after switching dashboard tabs", async () => {
    apiMocks.getAssistantMessages.mockResolvedValue({
      items: [
        {
          id: "message-1",
          threadId: thread.id,
          role: "assistant",
          content: "You spent PHP 1,250 this month.",
          status: "completed",
          createdAt: "2026-07-27T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    renderRouteHarness();

    await screen.findByText(thread.title);
    fireEvent.click(screen.getAllByRole("button", { name: /budget review/i })[0]!);
    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeInTheDocument();

    const composer = screen.getByRole("textbox", { name: "Ask about your finances" });
    fireEvent.change(composer, { target: { value: "Compare it with last month" } });
    expect(apiMocks.getAssistantMessages).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Calendar tab" }));
    expect(screen.getByText("Calendar page")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assistant tab" }));

    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask about your finances" })).toHaveValue(
      "Compare it with last month",
    );
    expect(apiMocks.getAssistantThreads).toHaveBeenCalledTimes(1);
    expect(apiMocks.getAssistantMessages).toHaveBeenCalledTimes(1);
  });

  it("removes an individual chat from history immediately", async () => {
    let completeDelete: (() => void) | undefined;
    apiMocks.deleteAssistantThread.mockImplementation(
      () => new Promise<void>((resolve) => { completeDelete = resolve; }),
    );
    const { queryClient } = renderPage();

    await screen.findByText(thread.title);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${thread.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText(thread.title)).not.toBeInTheDocument());
    expect(queryClient.getQueryData(queryKeys.assistantThreads({ key: "user:user-1", userId: "user-1" }))).toEqual({
      items: [],
      nextCursor: null,
    });

    completeDelete?.();
    await waitFor(() => expect(apiMocks.getAssistantThreads).toHaveBeenCalledTimes(2));
  });

  it("keeps an empty thread-list cache after deleting every chat", async () => {
    let threads = [thread];
    apiMocks.getAssistantThreads.mockImplementation(() => Promise.resolve({ items: threads, nextCursor: null }));
    apiMocks.deleteAllAssistantThreads.mockImplementation(async () => { threads = []; });
    const { queryClient } = renderPage();

    await screen.findByText(thread.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete all chats" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() => expect(screen.getByText("Your recent questions will appear here.")).toBeInTheDocument());
    expect(queryClient.getQueryData(queryKeys.assistantThreads({ key: "user:user-1", userId: "user-1" }))).toEqual({
      items: [],
      nextCursor: null,
    });
    await waitFor(() => expect(apiMocks.getAssistantThreads).toHaveBeenCalledTimes(2));
  });
});
