// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
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
  });

  it("marks its animation static for reduced-motion preferences", () => {
    motionState.reduceMotion = true;
    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking your session." />);

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
  });
});
