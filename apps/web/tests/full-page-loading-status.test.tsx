// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionState.reduceMotion,
}));

import { FullPageLoadingStatus } from "../src/components/layout/FullPageLoadingStatus";

describe("FullPageLoadingStatus", () => {
  beforeEach(() => {
    motionState.reduceMotion = false;
  });

  afterEach(cleanup);

  it("announces visible workspace preparation copy", () => {
    render(
      <FullPageLoadingStatus
        title="Preparing your workspace"
        description="Loading your latest budget details."
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Preparing your workspace");
    expect(screen.getByRole("status")).toHaveTextContent("Loading your latest budget details.");
    expect(screen.getByRole("status")).toHaveTextContent("Zoption Platform");
  });

  it("marks its animation static for reduced-motion preferences", () => {
    const onComplete = vi.fn();
    motionState.reduceMotion = true;
    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking your session."
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Workspace ready")).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes animation and fires onComplete callback", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let rafCallback: ((time: number) => void) | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallback = cb;
      return 1;
    });

    const onComplete = vi.fn();
    render(
      <FullPageLoadingStatus
        title="Restoring workspace"
        description="Setting up session"
        durationMs={1000}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByText("Securing encrypted session")).toBeInTheDocument();

    // Advance partially
    act(() => {
      now = 300;
      rafCallback?.(now);
    });

    expect(screen.getByText("Synthesizing cashflow models")).toBeInTheDocument();

    // Advance to completion
    act(() => {
      now = 1000;
      rafCallback?.(now);
    });

    expect(screen.getByText("Workspace ready")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});


