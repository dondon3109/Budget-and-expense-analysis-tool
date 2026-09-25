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

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("announces visible workspace preparation copy", () => {
    render(
      <FullPageLoadingStatus
        title="Preparing your workspace"
        description="Loading your latest budget details."
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Preparing your workspace");
    expect(status).toHaveTextContent("Loading your latest budget details.");
    expect(status).toHaveTextContent("Zoption Platform");
  });

  it("shows the ledger loader as decoration beside the announced copy", () => {
    const { container } = render(
      <FullPageLoadingStatus title="Restoring your workspace" description="Checking." />,
    );

    const loader = container.querySelector(".ledger-loader");
    expect(loader).toHaveAttribute("data-size", "large");
    expect(loader).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".ledger-loader-row")).toHaveLength(3);
  });

  it("reports only the phases the app can actually observe", () => {
    const { rerender } = render(
      <FullPageLoadingStatus title="Restoring your workspace" description="Checking." />,
    );

    expect(screen.getByText("Checking your session")).toBeInTheDocument();
    // Nothing countable is known yet, so no rail claims a progress value.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    rerender(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        phase="summary"
        progress={2}
      />,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "Fetching this month's summary");
    expect(screen.getByText("Fetching this month's summary")).toBeInTheDocument();
  });

  it("drives the rail with transform, not width", () => {
    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        phase="workspace"
        progress={1}
      />,
    );

    const fill = document.querySelector<HTMLElement>(".full-page-loading-fill");
    expect(fill?.style.transform).toBe("scaleX(0.3333333333333333)");
  });

  it("holds a still frame when motion is reduced", () => {
    motionState.reduceMotion = true;

    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
    expect(document.querySelector(".ledger-loader")).toHaveAttribute("data-reduced-motion");
  });

  it("holds the surface until the app is ready, then hands over on its exit", async () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
    const exit = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    Object.defineProperty(Element.prototype, "animate", { value: exit, configurable: true });
    const onComplete = vi.fn();

    const { rerender } = render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        onComplete={onComplete}
      />,
    );

    // The surface mounts long before the workspace behind it can be shown. An exit
    // fired here fades the app into view and then snaps the surface back, which is
    // the flash the splash used to show on every startup.
    expect(exit).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    rerender(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        ready
        onComplete={onComplete}
      />,
    );

    // Filled forwards, so the surface cannot reappear between the fade ending and
    // the caller unmounting it.
    expect(exit).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], {
      duration: 240,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    if (original) Object.defineProperty(Element.prototype, "animate", original);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  it("still hands over when the exit cannot animate", () => {
    const onComplete = vi.fn();

    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        ready
        onComplete={onComplete}
      />,
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("waits for readiness under reduced motion, then completes with no exit", () => {
    motionState.reduceMotion = true;
    const onComplete = vi.fn();

    const { rerender } = render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        onComplete={onComplete}
      />,
    );
    // Readiness gates the handover before reduced motion skips the exit, so this
    // surface cannot vanish at mount for a reader who asked for less motion.
    expect(onComplete).not.toHaveBeenCalled();

    rerender(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        ready
        onComplete={onComplete}
      />,
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
