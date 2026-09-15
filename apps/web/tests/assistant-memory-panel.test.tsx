// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  clearAssistantMemory: vi.fn(),
  getAssistantMemory: vi.fn(),
  getAssistantMemoryPreferences: vi.fn(),
  updateAssistantMemoryPreferences: vi.fn(),
  updateAssistantMemory: vi.fn(),
  deleteAssistantMemory: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  ...apiMocks,
}));

import { AssistantMemoryPanel } from "../src/components/assistant/AssistantMemoryPanel";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";

const mockWorkspace: AuthenticatedWorkspace = {
  key: "user:ws-1",
  userId: "ws-1",
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

/** Mirrors AssistantPage: the panel mounts only while it is open, from a trigger button. */
function MemoryPanelHarness() {
  const [open, setOpen] = useState(false);
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <button type="button" onClick={() => setOpen(true)}>
        Open memory
      </button>
      {open && (
        <AssistantMemoryPanel workspace={mockWorkspace} open onClose={() => setOpen(false)} />
      )}
    </QueryClientProvider>
  );
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
    apiMocks.updateAssistantMemory
      .mockReset()
      .mockImplementation(async (_w: unknown, id: string, value: string) => ({
        id,
        kind: "fact",
        key: "goal",
        value,
        source: "user_stated",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      }));
    apiMocks.deleteAssistantMemory.mockReset().mockResolvedValue(undefined);
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

  it("confines Tab to the panel and starts on its first control", async () => {
    renderPanel();

    const dialog = await screen.findByRole("dialog", { name: "Memory & Preferences" });
    const closeButton = screen.getByRole("button", { name: "Close assistant memory" });
    expect(closeButton).toHaveFocus();

    const buttons = within(dialog).getAllByRole("button");
    const lastButton = buttons.at(-1);
    if (!lastButton) throw new Error("Expected the panel to expose buttons.");
    lastButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });

    expect(closeButton).toHaveFocus();
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    render(<MemoryPanelHarness />);

    const opener = screen.getByRole("button", { name: "Open memory" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Memory & Preferences" });

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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
    // The server drops the stored preference with the facts, so the control must not
    // keep showing the strategy it had (the preferences query never goes stale).
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /No preference/ })).toBeChecked();
    });
  });

  it("edits and deletes a single remembered fact", async () => {
    apiMocks.getAssistantMemory.mockResolvedValue([
      {
        id: "mem-1",
        kind: "fact",
        key: "monthly_budget_cap",
        value: "Car downpayment goal",
        source: "user_stated",
        threadTitle: "Car savings",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      },
    ]);
    renderPanel();
    expect(await screen.findByText("Car downpayment goal")).toBeInTheDocument();
    expect(screen.getByText("Monthly budget cap · from “Car savings”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Edit remembered fact");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "  Updated goal  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(apiMocks.updateAssistantMemory).toHaveBeenCalledWith(
        mockWorkspace,
        "mem-1",
        "Updated goal",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(apiMocks.deleteAssistantMemory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => {
      expect(apiMocks.deleteAssistantMemory).toHaveBeenCalledWith(mockWorkspace, "mem-1");
    });
  });

  it("keeps the payoff preference out of the editable facts", async () => {
    apiMocks.getAssistantMemory.mockResolvedValue([
      {
        id: "mem-preference",
        kind: "preference",
        key: "debt_strategy",
        value: "avalanche",
        source: "user_stated",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      },
      {
        id: "mem-fact",
        kind: "fact",
        key: "debt_rule",
        value: "Pays the smallest balance first",
        source: "model_assisted",
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      },
    ]);
    renderPanel();

    expect(await screen.findByText("Pays the smallest balance first")).toBeInTheDocument();
    // The preference is owned by the strategy control above, so only the fact row
    // offers edit and delete.
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    expect(screen.getByText("Debt rule")).toBeInTheDocument();
  });
});
