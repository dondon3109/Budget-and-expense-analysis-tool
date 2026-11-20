// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { MoneyPreferences } from "@zoption/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getGoalProfile = vi.hoisted(() => vi.fn());
const saveGoals = vi.hoisted(() => vi.fn());
const getMoneyPreferences = vi.hoisted(() =>
  vi.fn(async (): Promise<MoneyPreferences> => ({
    incomeCadence: null,
    budgetingStyle: null,
    spendingFocus: [],
  })),
);
const saveMoneyPreferences = vi.hoisted(() =>
  vi.fn(async (_workspace: unknown, input: MoneyPreferences) => input),
);

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  getGoalProfile,
  saveGoals,
  getMoneyPreferences,
  saveMoneyPreferences,
}));

import { GoalSettings } from "../src/components/account/GoalSettings";

const workspace = { key: "user:user-1", userId: "user-1" } as const;
const profile = (goals: string[], otherText: string | null = null) => ({
  goals,
  goal: goals[0] ?? null,
  otherText,
  selectedAt: goals.length ? "2026-01-01T00:00:00.000Z" : null,
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

  it("lists every current goal and saves a changed selection after Save goals, then thanks", async () => {
    getGoalProfile.mockResolvedValue(profile(["build_budget", "track_spending"]));
    saveGoals.mockResolvedValue(profile(["build_budget", "reduce_debt"]));
    renderSettings();

    expect(
      await screen.findByText(/Current goals: Create and stick.*Track where/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /^Create and stick to a monthly budget/ }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Track where my money goes" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Track where my money goes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pay off debt / utang" }));
    expect(saveGoals).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() =>
      expect(saveGoals).toHaveBeenCalledWith(workspace, {
        goals: ["build_budget", "reduce_debt"],
        otherText: "",
      }),
    );
    expect(
      await screen.findByText(/Current goals: Create and stick.*Pay off debt/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Thank you! Your goals are saved.")).toBeInTheDocument();
  });

  it("cannot save an empty selection", async () => {
    getGoalProfile.mockResolvedValue(profile(["build_budget"]));
    renderSettings();

    fireEvent.click(
      await screen.findByRole("checkbox", { name: /^Create and stick to a monthly budget/ }),
    );
    expect(screen.getByRole("button", { name: "Save goals" })).toBeDisabled();
  });

  it("prompts softly when no goal is set", async () => {
    getGoalProfile.mockResolvedValue(profile([]));
    renderSettings();

    expect(await screen.findByText(/Not set/)).toBeInTheDocument();
  });

  it("shows and edits the Other note", async () => {
    getGoalProfile.mockResolvedValue(profile(["other"], "Wedding fund"));
    saveGoals.mockResolvedValue(profile(["other"], "House fund"));
    renderSettings();

    const note = await screen.findByRole("textbox", { name: /Tell us more/ });
    expect(note).toHaveValue("Wedding fund");
    fireEvent.change(note, { target: { value: "House fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Save goals" }));

    await waitFor(() =>
      expect(saveGoals).toHaveBeenCalledWith(workspace, {
        goals: ["other"],
        otherText: "House fund",
      }),
    );
  });

  it("shows the saved money habits and saves a change", async () => {
    getGoalProfile.mockResolvedValue(profile(["build_budget"]));
    getMoneyPreferences.mockResolvedValueOnce({
      incomeCadence: "weekly",
      budgetingStyle: "zero_based",
      spendingFocus: [],
    });
    renderSettings();

    expect(await screen.findByRole("radio", { name: "Every week" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Give every peso a job" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /It varies/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Transport" }));
    fireEvent.click(screen.getByRole("button", { name: "Save money habits" }));

    await waitFor(() =>
      expect(saveMoneyPreferences).toHaveBeenCalledWith(workspace, {
        incomeCadence: "irregular",
        budgetingStyle: "zero_based",
        spendingFocus: ["transport"],
      }),
    );
    expect(await screen.findByText("Saved. Your suggestions are updated.")).toBeInTheDocument();
  });
});
