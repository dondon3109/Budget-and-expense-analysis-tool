// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionState.reduceMotion,
}));

import { InlineLoader } from "../src/components/layout/InlineLoader";

describe("InlineLoader", () => {
  beforeEach(() => {
    motionState.reduceMotion = false;
  });

  afterEach(cleanup);

  it("renders with default label", () => {
    render(<InlineLoader />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<InlineLoader label="Preparing your financial plan" />);

    expect(screen.getByText("Preparing your financial plan…")).toBeInTheDocument();
  });

  it("marks its animation static for reduced-motion preferences", () => {
    motionState.reduceMotion = true;
    render(<InlineLoader label="Fetching transactions" />);

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
    expect(screen.getByText("Fetching transactions…")).toBeInTheDocument();
  });
});
