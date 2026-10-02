// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssistantConversation,
  quickPromptsForGoal,
} from "../src/components/assistant/AssistantConversation";
import {
  VOICE_SUGGESTED_PROMPTS,
  voiceSuggestedPrompts,
} from "../src/components/assistant/voiceSuggestedPrompts";
import { GoalChecklist, GoalCtaButton } from "../src/components/dashboard/GoalChecklist";
import type { AuthenticatedWorkspace } from "../src/lib/workspace";
import { renderWithProviders } from "./helpers/render";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "getAssistantThreads",
    "getDebts",
    "getFinancialGoals",
  ]),
);

import { getAssistantThreads, getDebts, getFinancialGoals } from "../src/lib/api";

const workspace: AuthenticatedWorkspace = { key: "user:test-user", userId: "test-user" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("assistant starter prompts", () => {
  it("puts the goal's starter first and keeps the list length", () => {
    const prompts = quickPromptsForGoal("build_budget");
    expect(prompts[0]?.prompt).toBe("Help me build a budget from my income");
    expect(prompts).toHaveLength(quickPromptsForGoal(null).length);
  });

  it("leaves today's prompts for no goal and for other", () => {
    expect(quickPromptsForGoal(null)).toBe(quickPromptsForGoal(undefined));
    expect(quickPromptsForGoal("other")).toBe(quickPromptsForGoal(null));
    expect(quickPromptsForGoal(null)[0]?.prompt).toBe("How much did I spend this month?");
  });

  it("renders the goal prompt first in the conversation", () => {
    renderWithProviders(
      <AssistantConversation
        assistantName="Pigoy"
        goal="reduce_debt"
        messages={[]}
        loading={false}
        onPrompt={() => undefined}
      />,
    );
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("Make me a payoff plan");
  });

  it("orders voice suggestions with the goal first, unchanged without one", () => {
    expect(voiceSuggestedPrompts("en", "save_for_goal")[0]).toBe("How fast can I reach my goal?");
    expect(voiceSuggestedPrompts("en", null)).toEqual(VOICE_SUGGESTED_PROMPTS);
    expect(voiceSuggestedPrompts("fil", "save_for_goal")[0]).toBe("How fast can I reach my goal?");
  });
});

describe("goal CTA and checklist", () => {
  it("shows the goal CTA and nothing without a goal", () => {
    const onAction = vi.fn();
    const { unmount } = renderWithProviders(
      <GoalCtaButton goal="track_spending" onAction={onAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log your first expense" }));
    expect(onAction).toHaveBeenCalledWith("add_transaction");
    unmount();

    const { container } = renderWithProviders(<GoalCtaButton goal={null} onAction={onAction} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("derives completion from loaded data and dismisses", async () => {
    vi.mocked(getAssistantThreads).mockResolvedValue({ items: [] } as never);
    vi.mocked(getFinancialGoals).mockResolvedValue({ items: [] } as never);
    renderWithProviders(
      <GoalChecklist
        workspace={workspace}
        goal="save_for_goal"
        signals={{ has_transaction: true, has_budget: false }}
        onAction={() => undefined}
      />,
    );
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.dataset.done)).toEqual(["false", "true", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss checklist" }));
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("hides once every item is done", async () => {
    vi.mocked(getAssistantThreads).mockResolvedValue({ items: [{ id: "t1" }] } as never);
    renderWithProviders(
      <GoalChecklist
        workspace={workspace}
        goal="just_exploring"
        signals={{ has_transaction: true, has_budget: false }}
        onAction={() => undefined}
      />,
    );
    await waitFor(() => expect(getAssistantThreads).toHaveBeenCalled());
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("renders nothing for a workspace without a goal", () => {
    const { container } = renderWithProviders(
      <GoalChecklist
        workspace={workspace}
        goal={null}
        signals={{ has_transaction: false, has_budget: false }}
        onAction={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(getDebts).not.toHaveBeenCalled();
  });
});
