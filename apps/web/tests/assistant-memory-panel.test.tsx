// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  clearAssistantMemory: vi.fn(),
  getAssistantMemory: vi.fn(),
  getAssistantMemoryPreferences: vi.fn(),
  updateAssistantMemoryPreferences: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { AssistantMemoryPanel } from "../src/components/assistant/AssistantMemoryPanel";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

const mockWorkspace: AuthenticatedWorkspace = {
  id: "ws-1",
  name: "Personal",
  role: "owner",
  accessToken: "token-1",
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function renderPanel(props: { open?: boolean; onClose?: () => void } = {}) {
  const queryClient = createQueryClient();
  const onClose = props.onClose ?? vi.fn();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AssistantMemoryPanel
        workspace={mockWorkspace}
        open={props.open ?? true}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { ...result, queryClient, onClose };
}

afterEach(cleanup);

describe("AssistantMemoryPanel", () => {
  beforeEach(() => {
    apiMocks.clearAssistantMemory.mockReset().mockResolvedValue(undefined);
    apiMocks.getAssistantMemory.mockReset().mockResolvedValue([]);
    apiMocks.getAssistantMemoryPreferences.mockReset().mockResolvedValue({
      debtStrategy: "avalanche",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
    apiMocks.updateAssistantMemoryPreferences.mockReset().mockResolvedValue({
      debtStrategy: "snowball",
      responseDetail: "concise",
      coachingStyle: "gentle",
    });
  });

  it("renders the trust banner, strategy cards, and response style overview", async () => {
    renderPanel();

    expect(await screen.findByText("Memory & Preferences")).toBeInTheDocument();
    expect(screen.getByText("Private & Read-Only")).toBeInTheDocument();
    expect(screen.getByText("Debt payoff preference")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Avalanche/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Snowball/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /No preference/ })).toBeInTheDocument();

    expect(await screen.findByText(/Concise/)).toBeInTheDocument();
    expect(screen.getByText(/Gentle/)).toBeInTheDocument();
  });

  it("updates debt strategy preference when clicking a strategy card", async () => {
    renderPanel();

    const snowballCard = await screen.findByRole("radio", { name: /Snowball/ });
    fireEvent.click(snowballCard);

    await waitFor(() => {
      expect(apiMocks.updateAssistantMemoryPreferences).toHaveBeenCalledWith(
        mockWorkspace,
        { debtStrategy: "snowball" },
      );
    });
  });

  it("renders remembered facts with source pills and date labels", async () => {
    apiMocks.getAssistantMemory.mockResolvedValueOnce([
      {
        id: "mem-1",
        kind: "fact",
        key: "emergency_fund",
        value: "Emergency fund target is ₱100,000",
        source: "user_stated",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      },
      {
        id: "mem-2",
        kind: "fact",
        key: "rent_payment",
        value: "Rent is due on the 5th of every month",
        source: "model_assisted",
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:00:00.000Z",
      },
    ]);

    renderPanel();

    expect(await screen.findByText("Emergency fund target is ₱100,000")).toBeInTheDocument();
    expect(screen.getByText("Rent is due on the 5th of every month")).toBeInTheDocument();
    expect(screen.getByText("💬 You shared this")).toBeInTheDocument();
    expect(screen.getByText("🧠 Learned from context")).toBeInTheDocument();
  });

  it("shows rich empty state with example prompts when no facts are remembered", async () => {
    apiMocks.getAssistantMemory.mockResolvedValueOnce([]);

    renderPanel();

    expect(await screen.findByText("No remembered facts yet")).toBeInTheDocument();
    expect(screen.getByText(/Examples you can share in chat/)).toBeInTheDocument();
    expect(screen.getByText(/My emergency fund goal is ₱100,000/)).toBeInTheDocument();
  });

  it("requires confirmation before clearing memory", async () => {
    apiMocks.getAssistantMemory.mockResolvedValue([
      {
        id: "mem-1",
        kind: "fact",
        key: "goal",
        value: "Car downpayment goal",
        source: "user_stated",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      },
    ]);

    renderPanel();

    expect(await screen.findByText("Car downpayment goal")).toBeInTheDocument();
    const clearButton = screen.getByRole("button", { name: /Clear memory/ });
    expect(clearButton).not.toBeDisabled();
    fireEvent.click(clearButton);

    expect(await screen.findByText("Clear all assistant memory?")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: "Yes, clear memory" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiMocks.clearAssistantMemory).toHaveBeenCalledWith(mockWorkspace);
    });
  });
});
