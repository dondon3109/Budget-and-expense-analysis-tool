// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getGoalProfile = vi.hoisted(() => vi.fn());
const saveGoal = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getGoalProfile,
  saveGoal,
}));

import { GoalSettings } from "../src/components/account/GoalSettings";

const workspace = { key: "user:user-1", userId: "user-1" } as const;
const profile = (goal: string | null, otherText: string | null = null) => ({
  goal,
  otherText,
  selectedAt: goal ? "2026-01-01T00:00:00.000Z" : null,
  skipped: false,
});

function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalSettings workspace={workspace} />
    </QueryClientProvider>,
  );
}

describe("GoalSettings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the current goal and saves a change", async () => {
    getGoalProfile.mockResolvedValue(profile("build_budget"));
    saveGoal.mockResolvedValue(profile("reduce_debt"));
    renderSettings();

    expect(await screen.findByText(/Current goal: Create and stick/)).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Create and stick to a monthly budget" }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Pay off debt / utang" }));
    await waitFor(() => expect(saveGoal).toHaveBeenCalledWith(workspace, { goal: "reduce_debt" }));
    expect(await screen.findByText(/Current goal: Pay off debt/)).toBeInTheDocument();
  });

  it("prompts softly when no goal is set", async () => {
    getGoalProfile.mockResolvedValue(profile(null));
    renderSettings();

    expect(await screen.findByText(/Not set/)).toBeInTheDocument();
  });

  it("shows and edits the Other note", async () => {
    getGoalProfile.mockResolvedValue(profile("other", "Wedding fund"));
    saveGoal.mockResolvedValue(profile("other", "House fund"));
    renderSettings();

    const note = await screen.findByRole("textbox", { name: /Tell us more/ });
    expect(note).toHaveValue("Wedding fund");
    fireEvent.change(note, { target: { value: "House fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }));

    await waitFor(() =>
      expect(saveGoal).toHaveBeenCalledWith(workspace, { goal: "other", otherText: "House fund" }),
    );
  });
});
