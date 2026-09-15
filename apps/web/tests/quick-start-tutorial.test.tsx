// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuickStartTutorial } from "../src/components/dashboard/QuickStartTutorial";

describe("QuickStartTutorial", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(cleanup);

  it("renders 4 onboarding steps and triggers onAdjustBalance", () => {
    const onAdjust = vi.fn();
    render(
      <MemoryRouter>
        <QuickStartTutorial onAdjustBalance={onAdjust} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Quick Start Guide/i })).toBeInTheDocument();
    expect(screen.getByText("Adjust your balances")).toBeInTheDocument();
    expect(screen.getByText("Set envelope budgets")).toBeInTheDocument();
    expect(screen.getByText("Log daily spending")).toBeInTheDocument();
    expect(screen.getByText("Read full tutorials")).toBeInTheDocument();

    const adjustButton = screen.getByRole("button", { name: "Adjust balance now" });
    fireEvent.click(adjustButton);
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });

  it("can be collapsed and expanded", () => {
    render(
      <MemoryRouter>
        <QuickStartTutorial />
      </MemoryRouter>,
    );

    const collapseButton = screen.getByRole("button", { name: "Collapse Quick Start Tutorial" });
    fireEvent.click(collapseButton);

    expect(screen.queryByText("Adjust your balances")).not.toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Expand Quick Start Tutorial" });
    fireEvent.click(expandButton);

    expect(screen.getByText("Adjust your balances")).toBeInTheDocument();
  });

  it("disappears when dismissed with the close button and persists dismissed state", () => {
    const { unmount } = render(
      <MemoryRouter>
        <QuickStartTutorial />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Quick Start Guide/i })).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: "Dismiss Quick Start Tutorial" });
    fireEvent.click(dismissButton);

    expect(screen.queryByRole("heading", { name: /Quick Start Guide/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-start-tutorial")).not.toBeInTheDocument();
    expect(localStorage.getItem("zoption:quick-start-tutorial-state")).toBe("dismissed");

    unmount();

    // Re-rendering with persisted dismissed state stays hidden
    render(
      <MemoryRouter>
        <QuickStartTutorial />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("heading", { name: /Quick Start Guide/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-start-tutorial")).not.toBeInTheDocument();
  });
});
