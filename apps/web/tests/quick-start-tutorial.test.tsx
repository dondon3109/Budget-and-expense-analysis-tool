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

  it("can be dismissed and reopened", () => {
    render(
      <MemoryRouter>
        <QuickStartTutorial />
      </MemoryRouter>,
    );

    const dismissButton = screen.getByRole("button", { name: "Dismiss Quick Start Tutorial" });
    fireEvent.click(dismissButton);

    expect(screen.queryByText("Adjust your balances")).not.toBeInTheDocument();
    const reopenPrompt = screen.getByRole("button", {
      name: /New to Zoption\? View Quick Start Tutorial/i,
    });
    expect(reopenPrompt).toBeInTheDocument();

    fireEvent.click(reopenPrompt);
    expect(screen.getByText("Adjust your balances")).toBeInTheDocument();
  });
});
