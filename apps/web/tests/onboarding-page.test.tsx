// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type * as Api from "../src/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const funnel = vi.hoisted(() => ({ captureFunnelEvent: vi.fn() }));

vi.mock("../src/analytics/funnel", () => funnel);

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ loading: false, user: { id: "user-1" } }),
}));

vi.mock("../src/components/auth/AuthLayout", () => ({
  AuthLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  ...(await import("./helpers/api-mock")).createApiMock([
    "getOnboardingState",
    "saveOnboardingCurrency",
    "saveOnboardingCashBalance",
    "getGoalProfile",
    "saveGoals",
    "skipGoal",
    "markGoalShown",
    "getMoneyPreferences",
    "saveMoneyPreferences",
    "checkInPet",
    "setPetEnabled",
  ]),
}));

import type { PetView } from "@zoption/shared";

import {
  ApiRequestError,
  checkInPet,
  getGoalProfile,
  getMoneyPreferences,
  getOnboardingState,
  markGoalShown,
  saveGoals,
  saveMoneyPreferences,
  saveOnboardingCashBalance,
  saveOnboardingCurrency,
  setPetEnabled,
  skipGoal,
} from "../src/lib/api";
import { OnboardingPage } from "../src/pages/OnboardingPage";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { renderWithProviders } from "./helpers/render";

const newPet: PetView = {
  enabled: true,
  species: null,
  name: null,
  color: null,
  stage: "egg",
  points: 0,
  nextStagePoints: null,
  pointsToday: 0,
  eggStreakDays: 0,
  eggHatchDays: 7,
  health: null,
  healthState: null,
  lastActivityAt: null,
  diedAt: null,
};

function renderPage() {
  return renderWithProviders(
    <ThemeProvider>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/app" element={<p>Dashboard page</p>} />
        <Route path="/app/pet" element={<p>Pet page</p>} />
      </Routes>
    </ThemeProvider>,
    { route: "/onboarding" },
  );
}

const personalizeHeading = () => screen.findByRole("heading", { name: "Make it yours" });

async function finishCashStep() {
  await screen.findByRole("textbox", { name: /Physical cash on hand/ });
  fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
}

describe("OnboardingPage", () => {
  const unset = { goals: [], goal: null, otherText: null, selectedAt: null, skipped: false };

  beforeEach(() => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-PH");
    funnel.captureFunnelEvent.mockReset();
    // Most cases focus on currency/cash/personalize, so goal and habits start answered unless reset.
    vi.mocked(getGoalProfile).mockResolvedValue({ ...unset, skipped: true });
    vi.mocked(markGoalShown).mockResolvedValue();
    vi.mocked(getMoneyPreferences).mockResolvedValue({
      incomeCadence: "monthly",
      budgetingStyle: null,
      spendingFocus: [],
    });
    vi.mocked(saveMoneyPreferences).mockImplementation(async (_workspace, input) => input);
    vi.mocked(saveGoals).mockImplementation(async (_workspace, input) => ({
      goals: input.goals,
      goal: input.goals[0] ?? null,
      otherText: input.otherText ?? null,
      selectedAt: "2026-01-01T00:00:00.000Z",
      skipped: false,
    }));
    vi.mocked(skipGoal).mockResolvedValue({ ...unset, skipped: true });
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    vi.mocked(saveOnboardingCurrency).mockImplementation(async (_workspace, input) => ({
      step: "cash",
      currency: input.currency,
    }));
    vi.mocked(saveOnboardingCashBalance).mockResolvedValue({
      step: "complete",
      currency: "PHP",
      openingBalanceBooked: true,
    });
    vi.mocked(checkInPet).mockResolvedValue(newPet);
    vi.mocked(setPetEnabled).mockImplementation(async (_workspace, enabled) => ({
      ...newPet,
      enabled,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("walks currency, cash, and personalize, records funnel events, and lands on the dashboard", async () => {
    renderPage();

    const trigger = await screen.findByRole("button", { name: /Base currency/ });
    expect(trigger).toHaveTextContent("PHP Philippine Peso");
    expect(funnel.captureFunnelEvent).toHaveBeenCalledWith("onboarding_started", {});
    fireEvent.click(trigger);
    expect(screen.getByRole("radio", { name: /PHP.*Philippine Peso/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /USD.*US Dollar/ })).not.toBeChecked();
    expect(screen.getByText(/change it later in Account Settings/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Base currency");

    fireEvent.click(screen.getByRole("radio", { name: /USD.*US Dollar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm currency" }));
    await waitFor(() =>
      expect(saveOnboardingCurrency).toHaveBeenCalledWith(expect.anything(), { currency: "USD" }),
    );
    expect(funnel.captureFunnelEvent).toHaveBeenCalledWith("onboarding_step_completed", {
      step: "currency",
    });

    const amount = await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    expect(amount).toHaveValue("");
    expect(amount).toHaveAttribute("placeholder", "0.00");
    expect(screen.getByLabelText("USD")).toHaveTextContent("$");

    fireEvent.change(amount, { target: { value: "1,250.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    await waitFor(() =>
      expect(saveOnboardingCashBalance).toHaveBeenCalledWith(expect.anything(), {
        amountMinor: 125_050,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );

    await personalizeHeading();
    fireEvent.click(screen.getByRole("radio", { name: "Fun" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "fun");
    fireEvent.click(screen.getByRole("radio", { name: /No pet for now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(setPetEnabled).toHaveBeenCalledWith(expect.anything(), false);
    expect(funnel.captureFunnelEvent).toHaveBeenCalledWith("onboarding_completed", {});
  });

  it("suggests a starting currency from browser locale on a fresh currency step", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    renderPage();

    const trigger = await screen.findByRole("button", { name: /Base currency/ });
    expect(trigger).toHaveTextContent("USD US Dollar");
  });

  it("treats a blank cash field as zero without blocking", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    renderPage();

    await finishCashStep();
    await waitFor(() =>
      expect(saveOnboardingCashBalance).toHaveBeenCalledWith(expect.anything(), {
        amountMinor: 0,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("sends a new user who wants a pet to the egg picker without another request", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    renderPage();

    await finishCashStep();
    await personalizeHeading();
    await waitFor(() => expect(checkInPet).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Pick my egg" }));
    expect(await screen.findByText("Pet page")).toBeInTheDocument();
    expect(setPetEnabled).not.toHaveBeenCalled();
  });

  it.each([
    ["abc", "Enter a number with no more than two decimal places."],
    ["12.345", "Enter a number with no more than two decimal places."],
    ["-5", "Cash on hand cannot be negative."],
    ["99999999999", "That amount is too large."],
  ])("shows an inline error for %j and saves nothing", async (value, message) => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    renderPage();

    const amount = await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    fireEvent.change(amount, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(saveOnboardingCashBalance).not.toHaveBeenCalled();
  });

  it("goes back with the previous selection and shows the new currency's symbol", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "USD" });
    renderPage();

    expect(await screen.findByLabelText("USD")).toHaveTextContent("$");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    const trigger = await screen.findByRole("button", { name: /Base currency/ });
    expect(trigger).toHaveTextContent("USD US Dollar");
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("radio", { name: /PHP.*Philippine Peso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm currency" }));
    await waitFor(() => expect(screen.getByLabelText("PHP")).toHaveTextContent("₱"));
  });

  it("finishes when a repeated submit finds onboarding already complete", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    vi.mocked(saveOnboardingCashBalance).mockRejectedValue(
      new ApiRequestError("Onboarding is already complete.", 409, "onboarding_complete"),
    );
    renderPage();

    await finishCashStep();
    expect(await personalizeHeading()).toBeInTheDocument();
  });

  it("says so when the cash amount was not added to a workspace that already has data", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    vi.mocked(saveOnboardingCashBalance).mockResolvedValue({
      step: "complete",
      currency: "PHP",
      openingBalanceBooked: false,
    });
    renderPage();

    const amount = await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    fireEvent.change(amount, { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    expect(await screen.findByRole("status")).toHaveTextContent("was not added");
  });

  it("shows the finished screen even while workspace data refetches after the save", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    function SlowWorkspaceQuery() {
      useQuery({
        queryKey: ["workspace", "user:user-1", "dashboard"],
        queryFn: () => new Promise<string>((resolve) => setTimeout(() => resolve("data"), 300)),
      });
      return null;
    }
    renderWithProviders(
      <ThemeProvider>
        <SlowWorkspaceQuery />
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/app" element={<p>Dashboard page</p>} />
        </Routes>
      </ThemeProvider>,
      { route: "/onboarding" },
    );

    await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    await waitFor(() => expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    expect(await personalizeHeading()).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("offers a retry when the setup state fails to load", async () => {
    vi.mocked(getOnboardingState).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(
      "could not be loaded",
    );
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Base currency/ })).toBeInTheDocument();
  });

  it("resumes on the saved step after a refresh", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "USD" });
    renderPage();
    expect(
      await screen.findByRole("textbox", { name: /Physical cash on hand/ }),
    ).toBeInTheDocument();
  });

  it("sends a user who already finished onboarding to the dashboard", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
    renderPage();
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  describe("goal step", () => {
    beforeEach(() => {
      vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
      vi.mocked(getGoalProfile).mockResolvedValue(unset);
    });

    it("asks the goal after cash, records it once, and saves the picks before Make it yours", async () => {
      renderPage();
      await finishCashStep();

      expect(await screen.findByRole("group", { name: "Your goals" })).toBeInTheDocument();
      expect(screen.getByText("So we can set up the right starting point for you.")).toBeVisible();
      expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Your goal");
      expect(markGoalShown).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("checkbox", { name: "Save for something specific" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Pay off debt / utang" }));
      expect(saveGoals).not.toHaveBeenCalled();
      expect(screen.getByText("Main focus")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() =>
        expect(saveGoals).toHaveBeenCalledWith(expect.anything(), {
          goals: ["save_for_goal", "reduce_debt"],
          otherText: "",
        }),
      );
      expect(await personalizeHeading()).toBeInTheDocument();
    });

    it("localizes debt phrasing for non-PHP workspaces", async () => {
      vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "USD" });
      vi.mocked(saveOnboardingCashBalance).mockResolvedValue({
        step: "complete",
        currency: "USD",
        openingBalanceBooked: false,
      });
      renderPage();
      await finishCashStep();

      expect(await screen.findByRole("checkbox", { name: "Pay off debt" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /utang/ })).not.toBeInTheDocument();
    });

    it("needs at least one goal before Continue", async () => {
      renderPage();
      await finishCashStep();

      expect(await screen.findByRole("button", { name: "Continue" })).toBeDisabled();
      fireEvent.click(screen.getByRole("checkbox", { name: "Just looking around" }));
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
      fireEvent.click(screen.getByRole("checkbox", { name: "Just looking around" }));
      expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    });

    it("skips without blocking and remembers the skip", async () => {
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
      await waitFor(() => expect(skipGoal).toHaveBeenCalledTimes(1));
      expect(await personalizeHeading()).toBeInTheDocument();
      expect(funnel.captureFunnelEvent).toHaveBeenCalledWith("onboarding_step_skipped", {
        step: "goal",
      });
    });

    it("continues even when the skip request fails", async () => {
      vi.mocked(skipGoal).mockRejectedValue(new Error("offline"));
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
      expect(await personalizeHeading()).toBeInTheDocument();
    });

    it("surfaces an inline error instead of silently advancing when saving goals fails", async () => {
      vi.mocked(saveGoals).mockRejectedValue(new Error("offline"));
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("checkbox", { name: "Just looking around" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
      expect(screen.queryByRole("heading", { name: "Make it yours" })).not.toBeInTheDocument();
    });

    it("saves the optional note with Other", async () => {
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("checkbox", { name: "Other" }));
      expect(saveGoals).not.toHaveBeenCalled();
      const note = screen.getByRole("textbox", { name: /Tell us more/ });
      expect(note).toHaveAttribute("maxlength", "140");
      fireEvent.change(note, { target: { value: "Plan a wedding" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));

      await waitFor(() =>
        expect(saveGoals).toHaveBeenCalledWith(expect.anything(), {
          goals: ["other"],
          otherText: "Plan a wedding",
        }),
      );
      expect(await personalizeHeading()).toBeInTheDocument();
    });

    it("never shows a finished workspace the goal", async () => {
      vi.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
      renderPage();

      expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
      expect(markGoalShown).not.toHaveBeenCalled();
    });

    it("skips the goal when the profile fails to load", async () => {
      vi.mocked(getGoalProfile).mockRejectedValue(new Error("offline"));
      renderPage();
      await finishCashStep();

      expect(await personalizeHeading()).toBeInTheDocument();
      expect(markGoalShown).not.toHaveBeenCalled();
    });
  });

  describe("money habits step", () => {
    beforeEach(() => {
      vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
      vi.mocked(getMoneyPreferences).mockResolvedValue({
        incomeCadence: null,
        budgetingStyle: null,
        spendingFocus: [],
      });
    });

    it("comes after the goal, supports Back, and saves answers before Make it yours", async () => {
      vi.mocked(getGoalProfile).mockResolvedValue(unset);
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("checkbox", { name: "Just looking around" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));

      expect(
        await screen.findByRole("heading", { name: "How do you manage money?" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent(
        "Your money habits",
      );

      // Stepping back returns to the goal step.
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(
        await screen.findByRole("heading", { name: "What brings you to Zoption?" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Skip" }));
      expect(
        await screen.findByRole("heading", { name: "How do you manage money?" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("radio", { name: "Twice a month (kinsenas)" }));
      fireEvent.click(screen.getByRole("radio", { name: /50\/30\/20/ }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Food and groceries" }));
      fireEvent.click(screen.getByRole("checkbox", { name: "Bills and subscriptions" }));
      expect(saveMoneyPreferences).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));

      await waitFor(() =>
        expect(saveMoneyPreferences).toHaveBeenCalledWith(expect.anything(), {
          incomeCadence: "semi_monthly",
          budgetingStyle: "fifty_thirty_twenty",
          spendingFocus: ["food", "bills"],
        }),
      );
      expect(await personalizeHeading()).toBeInTheDocument();
    });

    it("allows at most three spending areas", async () => {
      renderPage();
      await finishCashStep();

      for (const name of ["Food and groceries", "Transport", "Shopping"]) {
        fireEvent.click(await screen.findByRole("checkbox", { name }));
      }
      expect(screen.getByRole("checkbox", { name: "Going out and hobbies" })).toBeDisabled();
      fireEvent.click(screen.getByRole("checkbox", { name: "Shopping" }));
      expect(screen.getByRole("checkbox", { name: "Going out and hobbies" })).toBeEnabled();
    });

    it("skips, or continues with nothing picked, without saving", async () => {
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
      expect(await personalizeHeading()).toBeInTheDocument();
      expect(saveMoneyPreferences).not.toHaveBeenCalled();
    });

    it("surfaces an inline error when saving preferences fails", async () => {
      vi.mocked(saveMoneyPreferences).mockRejectedValue(new Error("offline"));
      renderPage();
      await finishCashStep();

      fireEvent.click(await screen.findByRole("radio", { name: "Every week" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
      expect(screen.queryByRole("heading", { name: "Make it yours" })).not.toBeInTheDocument();
    });
  });
});
