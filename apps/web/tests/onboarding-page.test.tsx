// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type * as Api from "../src/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    "saveGoal",
    "skipGoal",
    "markGoalShown",
  ]),
}));

import {
  ApiRequestError,
  getGoalProfile,
  getOnboardingState,
  markGoalShown,
  saveGoal,
  saveOnboardingCashBalance,
  saveOnboardingCurrency,
  skipGoal,
} from "../src/lib/api";
import { OnboardingPage } from "../src/pages/OnboardingPage";
import { renderWithProviders } from "./helpers/render";

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/app" element={<p>Dashboard page</p>} />
    </Routes>,
    { route: "/onboarding" },
  );
}

describe("OnboardingPage", () => {
  const unset = { goal: null, otherText: null, selectedAt: null, skipped: false };

  beforeEach(() => {
    // Most cases are about the later steps, so the goal is already answered unless a case resets it.
    vi.mocked(getGoalProfile).mockResolvedValue({ ...unset, skipped: true });
    vi.mocked(markGoalShown).mockResolvedValue();
    vi.mocked(saveGoal).mockImplementation(async (_workspace, input) => ({
      goal: input.goal,
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("walks the three steps and lands on the dashboard", async () => {
    renderPage();

    const select = await screen.findByRole("combobox", { name: "Base currency" });
    expect(select).toHaveValue("PHP");
    expect(screen.getByRole("option", { name: "PHP - Philippine Peso" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "USD - US Dollar" })).toBeInTheDocument();
    expect(screen.getByText(/change it later in Account Settings/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Base currency");

    fireEvent.change(select, { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm currency" }));
    await waitFor(() =>
      expect(saveOnboardingCurrency).toHaveBeenCalledWith(expect.anything(), { currency: "USD" }),
    );

    const amount = await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    expect(amount).toHaveValue("0");
    expect(screen.getByLabelText("USD")).toHaveTextContent("$");

    fireEvent.change(amount, { target: { value: "1,250.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    await waitFor(() =>
      expect(saveOnboardingCashBalance).toHaveBeenCalledWith(expect.anything(), {
        amountMinor: 125_050,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );

    expect(await screen.findByText("Your first account is ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it.each([
    ["abc", "Enter a number with no more than two decimal places."],
    ["12.345", "Enter a number with no more than two decimal places."],
    ["-5", "Cash on hand cannot be negative."],
    ["", "Enter the cash you have on hand, or 0."],
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

    const select = await screen.findByRole("combobox", { name: "Base currency" });
    expect(select).toHaveValue("USD");

    fireEvent.change(select, { target: { value: "PHP" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm currency" }));
    await waitFor(() => expect(screen.getByLabelText("PHP")).toHaveTextContent("₱"));
  });

  it("finishes when a repeated submit finds onboarding already complete", async () => {
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "cash", currency: "PHP" });
    vi.mocked(saveOnboardingCashBalance).mockRejectedValue(
      new ApiRequestError("Onboarding is already complete.", 409, "onboarding_complete"),
    );
    renderPage();

    await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    expect(await screen.findByText("Your first account is ready")).toBeInTheDocument();
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
    // An active dashboard-like query makes the post-save invalidation take a moment.
    function SlowWorkspaceQuery() {
      useQuery({
        queryKey: ["workspace", "user:user-1", "dashboard"],
        queryFn: () => new Promise<string>((resolve) => setTimeout(() => resolve("data"), 300)),
      });
      return null;
    }
    renderWithProviders(
      <>
        <SlowWorkspaceQuery />
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/app" element={<p>Dashboard page</p>} />
        </Routes>
      </>,
      { route: "/onboarding" },
    );

    await screen.findByRole("textbox", { name: /Physical cash on hand/ });
    await waitFor(() => expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Confirm cash balance" }));
    expect(await screen.findByText("Your first account is ready")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("offers a retry when the setup state fails to load", async () => {
    // The query retries once before it reports the failure.
    vi.mocked(getOnboardingState).mockRejectedValue(new Error("offline"));
    renderPage();

    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(
      "could not be loaded",
    );
    vi.mocked(getOnboardingState).mockResolvedValue({ step: "currency", currency: "PHP" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
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
      vi.mocked(getGoalProfile).mockResolvedValue(unset);
    });

    it("shows the goal first, records it once, and persists the pick before currency", async () => {
      renderPage();

      expect(await screen.findByRole("group", { name: "Your main goal" })).toBeInTheDocument();
      expect(screen.getByText("So we can set up the right starting point for you.")).toBeVisible();
      expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Your goal");
      expect(markGoalShown).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("radio", { name: "Save for something specific" }));
      await waitFor(() =>
        expect(saveGoal).toHaveBeenCalledWith(expect.anything(), { goal: "save_for_goal" }),
      );
      expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
    });

    it("skips without blocking and remembers the skip", async () => {
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
      await waitFor(() => expect(skipGoal).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
    });

    it("continues even when the skip request fails", async () => {
      vi.mocked(skipGoal).mockRejectedValue(new Error("offline"));
      renderPage();

      fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
      expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
    });

    it("continues even when saving the goal fails", async () => {
      vi.mocked(saveGoal).mockRejectedValue(new Error("offline"));
      renderPage();

      fireEvent.click(await screen.findByRole("radio", { name: "Just looking around" }));
      expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
    });

    it("saves the optional note with Other", async () => {
      renderPage();

      fireEvent.click(await screen.findByRole("radio", { name: "Other" }));
      expect(saveGoal).not.toHaveBeenCalled();
      const note = screen.getByRole("textbox", { name: /Tell us more/ });
      expect(note).toHaveAttribute("maxlength", "140");
      fireEvent.change(note, { target: { value: "Plan a wedding" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));

      await waitFor(() =>
        expect(saveGoal).toHaveBeenCalledWith(expect.anything(), {
          goal: "other",
          otherText: "Plan a wedding",
        }),
      );
      expect(await screen.findByRole("combobox", { name: "Base currency" })).toBeInTheDocument();
    });

    it("never shows a finished workspace the goal", async () => {
      vi.mocked(getOnboardingState).mockResolvedValue({ step: "complete", currency: "PHP" });
      renderPage();

      expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
      expect(markGoalShown).not.toHaveBeenCalled();
    });

    it("does not ask again once the goal is chosen or when the profile will not load", async () => {
      vi.mocked(getGoalProfile).mockRejectedValue(new Error("offline"));
      renderPage();

      expect(
        await screen.findByRole("combobox", { name: "Base currency" }, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(markGoalShown).not.toHaveBeenCalled();
    });
  });
});
