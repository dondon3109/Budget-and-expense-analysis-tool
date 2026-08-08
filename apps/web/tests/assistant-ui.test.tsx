// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  createAssistantThread: vi.fn(),
  deleteAllAssistantThreads: vi.fn(),
  deleteAssistantThread: vi.fn(),
  getAssistantMessages: vi.fn(),
  getAssistantPreferences: vi.fn(),
  getAssistantThreads: vi.fn(),
  getBillingSummary: vi.fn(),
  getTransferFeeInsight: vi.fn(),
  sendAssistantMessage: vi.fn(),
  updateAssistantIdentity: vi.fn(),
}));

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", email: "user@example.com" } }),
}));

vi.mock("../src/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock("../src/components/theme/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { AssistantSessionProvider } from "../src/assistant/AssistantSessionProvider";
import { AssistantComposer } from "../src/components/assistant/AssistantComposer";
import { AssistantConsent } from "../src/components/assistant/AssistantConsent";
import { AssistantConversation } from "../src/components/assistant/AssistantConversation";
import { ApiRequestError } from "../src/lib/api";
import { queryKeys } from "../src/lib/queryKeys";
import { AssistantPage } from "../src/pages/AssistantPage";

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
        <MemoryRouter>
          <AssistantPage />
        </MemoryRouter>
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
    apiMocks.createAssistantThread.mockReset();
    apiMocks.deleteAllAssistantThreads.mockReset();
    apiMocks.deleteAssistantThread.mockReset();
    apiMocks.getAssistantMessages.mockReset().mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    apiMocks.getAssistantPreferences.mockReset().mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      consentVersion: 3,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
    apiMocks.updateAssistantIdentity.mockReset();
    apiMocks.getAssistantThreads.mockReset().mockResolvedValue({
      items: [thread],
      nextCursor: null,
    });
    apiMocks.getBillingSummary.mockReset().mockResolvedValue({
      plan: "free",
      status: null,
      interval: null,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      canCheckout: true,
      canManageBilling: false,
      nonTerminalSubscriptionCount: 0,
      usages: [
        {
          feature: "assistant_question",
          used: 1,
          limit: 4,
          periodKind: "anchored_14_day",
          periodStartedAt: "2026-07-18T00:00:00.000Z",
          resetsAt: "2026-08-01T00:00:00.000Z",
        },
        {
          feature: "file_import",
          used: 0,
          limit: 1,
          periodKind: "calendar_month",
          periodStartedAt: "2026-07-01T00:00:00.000Z",
          resetsAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      allowances: [{ resource: "custom_category", used: 0, limit: 1 }],
    });
    apiMocks.getTransferFeeInsight.mockReset().mockResolvedValue({
      hasFees: true,
      totalTransfers: 4,
      totalFeeChargedTransfers: 2,
      feesByCurrency: { PHP: 1_500, USD: 0 },
      weekly: [],
      recentWeekCount: 1,
      recentAverageTransfersPerWeek: 2,
      recentAverageFeeChargedTransfersPerWeek: 2,
    });
    apiMocks.sendAssistantMessage.mockReset();
  });

  it("requires an explicit consent action", () => {
    const accept = vi.fn();
    render(<AssistantConsent accepting={false} onAccept={accept} />);
    expect(screen.getByText(/only the financial data needed/i)).toBeInTheDocument();
    expect(screen.getByText(/assistant memory are kept/i)).toBeInTheDocument();
    expect(screen.getByText(/educational budgeting information only/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    expect(accept).toHaveBeenCalledOnce();
  });

  it("requires renewed consent when the stored disclosure version is stale", async () => {
    apiMocks.getAssistantPreferences.mockResolvedValueOnce({
      consentedAt: "2026-07-27T10:00:00.000Z",
      consentVersion: 1,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /Your data, your boundaries/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your MONEY, explained." }),
    ).not.toBeInTheDocument();
  });

  it("shows a proactive transfer fee insight with a disclaimer in a new conversation", async () => {
    renderPage();

    const welcome = await screen.findByRole("article", { name: "Transfer fee insight" });
    expect(within(welcome).getByText("Aster")).toBeInTheDocument();
    expect(welcome.textContent).toContain("₱15");
    expect(welcome.textContent).toContain("2 fee-charged transfers");
    expect(welcome.textContent).toContain("averaged 2 transfers per week");
    expect(welcome.textContent).toContain("fewer, larger transfers");
    expect(welcome.textContent).toMatch(
      /doesn.t provide personalized financial, investment, tax, or legal advice/i,
    );
    expect(
      screen.getByRole("heading", { name: "What would you like to understand?" }),
    ).toBeInTheDocument();
  });

  it("hides the transfer fee insight when a thread is active or no fees exist", async () => {
    apiMocks.getTransferFeeInsight.mockResolvedValue({
      hasFees: false,
      totalTransfers: 0,
      totalFeeChargedTransfers: 0,
      feesByCurrency: { PHP: 0, USD: 0 },
      weekly: [],
      recentWeekCount: 0,
      recentAverageTransfersPerWeek: 0,
      recentAverageFeeChargedTransfersPerWeek: 0,
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "What would you like to understand?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Transfer fee insight" }),
    ).not.toBeInTheDocument();

    apiMocks.getTransferFeeInsight.mockResolvedValue({
      hasFees: true,
      totalTransfers: 4,
      totalFeeChargedTransfers: 2,
      feesByCurrency: { PHP: 1_500, USD: 0 },
      weekly: [],
      recentWeekCount: 1,
      recentAverageTransfersPerWeek: 2,
      recentAverageFeeChargedTransfersPerWeek: 2,
    });
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

    await screen.findByText(thread.title);
    fireEvent.click(screen.getAllByRole("button", { name: /budget review/i })[0]!);

    expect(await screen.findByText("You spent PHP 1,250 this month.")).toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Transfer fee insight" }),
    ).not.toBeInTheDocument();
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

  it("renders assistant bold markers as safe emphasis", () => {
    const { container } = render(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content:
              "Your total bank income is **PHP 6,500.00**.\nYour balance is **PHP 5,800.00**.",
            status: "completed",
            createdAt: "2026-07-27T10:00:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );

    expect(screen.getByText("PHP 6,500.00").tagName).toBe("STRONG");
    expect(screen.getByText("PHP 5,800.00").tagName).toBe("STRONG");
    expect(container.querySelector(".assistant-message > div > p")?.textContent).not.toContain(
      "**",
    );
  });

  it("keeps unmatched markers and user formatting literal", () => {
    render(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content: "This **marker is unmatched.",
            status: "completed",
            createdAt: "2026-07-27T10:00:00.000Z",
          },
          {
            id: "user-1",
            threadId: "thread-1",
            role: "user",
            content: "Show **my income** this year.",
            status: "completed",
            createdAt: "2026-07-27T10:01:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );

    expect(screen.getByText("This **marker is unmatched.")).toBeInTheDocument();
    expect(screen.getByText("Show **my income** this year.")).toBeInTheDocument();
    expect(document.querySelector(".assistant-message.user p strong")).toBeNull();
  });

  it("escapes HTML inside assistant bold markers", () => {
    render(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content: '**<img src=x onerror="alert(1)">**',
            status: "completed",
            createdAt: "2026-07-27T10:00:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );

    expect(screen.getByText(/<img src=x/).tagName).toBe("STRONG");
    expect(document.querySelector("img")).toBeNull();
  });

  it("renders trusted source details and topic disclaimers from response metadata", () => {
    render(
      <AssistantConversation
        assistantName="Aster"
        messages={[
          {
            id: "assistant-1",
            threadId: "thread-1",
            role: "assistant",
            content: "Your recorded expenses were PHP 1,234.56.",
            status: "completed",
            metadata: {
              promptVersion: "expert-v1",
              compliance: { posture: "restricted_topic_education", topics: ["investment"] },
              resolvedPeriod: { from: "2026-07-01", to: "2026-07-31" },
              disclaimer: {
                text: "General investment education only. For advice tailored to you, consult a licensed financial professional.",
                topics: ["investment"],
              },
              sources: [
                {
                  label: "Period summary",
                  sourceType: "transactions",
                  period: { from: "2026-07-01", to: "2026-07-31" },
                  recordCount: 4,
                  dataQualityStatus: "limited",
                  limitations: ["Some transactions are uncategorized."],
                },
              ],
            },
            createdAt: "2026-07-27T10:00:00.000Z",
          },
        ]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );

    expect(screen.getByText(/Based on 4 transactions/)).toBeInTheDocument();
    expect(screen.getByText(/General investment education only/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Data used"));
    expect(screen.getByText("Data quality: limited")).toBeInTheDocument();
    expect(screen.getByText("Some transactions are uncategorized.")).toBeInTheDocument();
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

  it("removes the visual page header while retaining an accessible Assistant heading", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "AI Financial Assistant" }),
    ).toHaveClass("sr-only");
    expect(
      screen.queryByRole("heading", { name: "Your MONEY, explained." }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Ask about your records, budgets, goals, and debt. Zoption verifies the numbers.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/educational budgeting information only/i)).toBeInTheDocument();
    const usage = await screen.findByRole("progressbar", {
      name: "Plan usage",
    });
    expect(usage).toHaveAttribute("aria-valuenow", "1");
    expect(usage).toHaveAttribute("aria-valuemax", "4");

    const topline = usage.closest(".assistant-chat-topline");
    expect(topline).not.toBeNull();
    expect(Array.from(topline!.children)).toHaveLength(3);
    expect(topline!.children[0]).toHaveClass("assistant-chat-status");
    expect(topline!.children[0]).toHaveTextContent("Read only");
    expect(within(topline!.children[0] as HTMLElement).getByText("Aster")).toBeInTheDocument();
    expect(topline!.children[1]).toHaveClass("assistant-chat-usage");
    const usageContainer = topline!.querySelector<HTMLElement>(":scope > .assistant-chat-usage");
    expect(usageContainer).not.toBeNull();
    expect(within(usageContainer!).getByRole("progressbar")).toBe(usage);
    expect(topline!.children[2]).toHaveClass("assistant-chat-corner");
    expect(within(topline!.children[2] as HTMLElement).getByText("90-day private history")).toBeInTheDocument();
    expect(
      within(topline!.children[2] as HTMLElement).getByRole("button", { name: "Memory" }),
    ).toBeInTheDocument();
  });

  it("explains when an unused assistant cycle will begin", async () => {
    apiMocks.getBillingSummary.mockResolvedValueOnce({
      plan: "free",
      status: null,
      interval: null,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      canCheckout: true,
      canManageBilling: false,
      nonTerminalSubscriptionCount: 0,
      usages: [
        {
          feature: "assistant_question",
          used: 0,
          limit: 4,
          periodKind: "anchored_14_day",
          periodStartedAt: null,
          resetsAt: null,
        },
      ],
      allowances: [],
    });
    renderPage();

    const usage = await screen.findByRole("progressbar", {
      name: "Plan usage",
    });
    expect(usage).toHaveTextContent("4 remaining");
  });

  it("keeps the exhausted assistant allowance clear and actionable", async () => {
    apiMocks.getBillingSummary.mockResolvedValueOnce({
      plan: "free",
      status: null,
      interval: null,
      currentPeriodEndsAt: null,
      scheduledChangeAt: null,
      canCheckout: true,
      canManageBilling: false,
      nonTerminalSubscriptionCount: 0,
      usages: [
        {
          feature: "assistant_question",
          used: 4,
          limit: 4,
          periodKind: "anchored_14_day",
          periodStartedAt: "2026-07-18T00:00:00.000Z",
          resetsAt: "2026-08-01T00:00:00.000Z",
        },
      ],
      allowances: [],
    });
    renderPage();

    const usage = await screen.findByRole("progressbar", {
      name: "Plan usage",
    });
    expect(usage).toHaveAttribute("data-state", "exhausted");
    expect(usage).toHaveAttribute("aria-valuenow", "4");
    expect(usage).toHaveTextContent("Limit reached");
    expect(screen.getByRole("link", { name: "View Pro limits" })).toHaveAttribute(
      "href",
      "/app/settings#plan-and-billing",
    );
  });

  it("keeps the draft and shows the 14-day reset when the assistant limit is reached", async () => {
    apiMocks.createAssistantThread.mockRejectedValueOnce(
      new ApiRequestError(
        "You have reached your AI question limit for this 14-day period.",
        409,
        "assistant_cycle_limit_reached",
        {
          feature: "assistant_question",
          used: 4,
          limit: 4,
          periodKind: "anchored_14_day",
          periodStartedAt: "2099-07-18T00:00:00.000Z",
          resetsAt: "2099-08-01T00:00:00.000Z",
        },
      ),
    );
    renderPage();

    const composer = await screen.findByRole("textbox", { name: "Ask about your finances" });
    fireEvent.change(composer, { target: { value: "Where did my money go?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("dialog", { name: "No AI questions remaining this 14-day period" }),
    ).toHaveTextContent("4 of 4 AI questions");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("alert", { name: "14-day assistant limit reached" })).toHaveTextContent(
      "4 of 4 AI questions",
    );
    expect(composer).toHaveValue("Where did my money go?");
  });

  it("requires assistant and user names after consent, then displays the saved assistant name", async () => {
    apiMocks.getAssistantPreferences.mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      consentVersion: 3,
      retentionDays: 90,
      assistantName: null,
      userPreferredName: null,
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
    apiMocks.updateAssistantIdentity.mockResolvedValue({
      consentedAt: "2026-07-27T10:00:00.000Z",
      consentVersion: 3,
      retentionDays: 90,
      assistantName: "Aster",
      userPreferredName: "Sam",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
    renderPage();

    expect(
      await screen.findByRole("dialog", { name: "Make this assistant yours" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close assistant name editor" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your assistant's name"), {
      target: { value: "Aster" },
    });
    fireEvent.change(screen.getByLabelText("What should your assistant call you?"), {
      target: { value: "Sam" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(apiMocks.updateAssistantIdentity).toHaveBeenCalledWith(expect.anything(), {
        assistantName: "Aster",
        userPreferredName: "Sam",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Chats with Aster" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit assistant names" }));
    expect(await screen.findByRole("dialog", { name: "Edit assistant names" })).toBeInTheDocument();
  });

  it("places New chat below the history title and resets the conversation", async () => {
    const { container } = renderPage();

    await screen.findByText(thread.title);
    const history = screen.getByRole("complementary", { name: "Assistant chat history" });
    const newChat = within(history).getByRole("button", { name: "Start a new chat" });
    const historyToggle = screen.getByRole("button", { name: "History" });

    expect(history).toHaveAttribute("id", "assistant-chat-history");
    expect(historyToggle).toHaveAttribute("aria-controls", "assistant-chat-history");
    expect(historyToggle).toHaveAttribute("aria-expanded", "false");
    expect(newChat).toHaveTextContent("New chat");
    expect(
      within(history).getByRole("button", { name: "Edit assistant names" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText(thread.title).closest("button")!);
    const composer = await screen.findByRole("textbox", { name: "Ask about your finances" });
    fireEvent.change(composer, { target: { value: "Compare it with last month" } });
    fireEvent.click(historyToggle);

    expect(historyToggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".assistant-workspace")).toHaveClass("history-open");
    fireEvent.click(newChat);

    expect(composer).toHaveValue("");
    expect(container.querySelector(".assistant-workspace")).not.toHaveClass("history-open");
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
      () =>
        new Promise<void>((resolve) => {
          completeDelete = resolve;
        }),
    );
    const { queryClient } = renderPage();

    await screen.findByText(thread.title);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${thread.title}` }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText(thread.title)).not.toBeInTheDocument());
    expect(
      queryClient.getQueryData(
        queryKeys.assistantThreads({ key: "user:user-1", userId: "user-1" }),
      ),
    ).toEqual({
      items: [],
      nextCursor: null,
    });

    completeDelete?.();
    await waitFor(() => expect(apiMocks.getAssistantThreads).toHaveBeenCalledTimes(2));
  });

  it("keeps an empty thread-list cache after deleting every chat", async () => {
    let threads = [thread];
    apiMocks.getAssistantThreads.mockImplementation(() =>
      Promise.resolve({ items: threads, nextCursor: null }),
    );
    apiMocks.deleteAllAssistantThreads.mockImplementation(async () => {
      threads = [];
    });
    const { queryClient } = renderPage();

    await screen.findByText(thread.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete all chats" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() =>
      expect(screen.getByText("Your recent questions will appear here.")).toBeInTheDocument(),
    );
    expect(
      queryClient.getQueryData(
        queryKeys.assistantThreads({ key: "user:user-1", userId: "user-1" }),
      ),
    ).toEqual({
      items: [],
      nextCursor: null,
    });
    await waitFor(() => expect(apiMocks.getAssistantThreads).toHaveBeenCalledTimes(2));
  });
});
