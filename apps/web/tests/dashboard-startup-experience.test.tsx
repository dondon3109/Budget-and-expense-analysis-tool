// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionState.reduceMotion,
}));

import { DashboardStartupExperience } from "../src/components/dashboard/DashboardStartupExperience";

const onComplete = vi.fn();
const onPhaseChange = vi.fn();
let applicationRoot: HTMLDivElement;

function renderExperience({ isAppReady = false, isAppSettled = false } = {}) {
  return render(
    <DashboardStartupExperience
      isAppReady={isAppReady}
      isAppSettled={isAppSettled}
      hasCompleted={false}
      onComplete={onComplete}
      onPhaseChange={onPhaseChange}
    />,
  );
}

describe("DashboardStartupExperience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T08:00:00.000Z"));
    motionState.reduceMotion = false;
    onComplete.mockReset();
    onPhaseChange.mockReset();
    applicationRoot = document.createElement("div");
    applicationRoot.id = "root";
    document.body.append(applicationRoot);
  });

  afterEach(() => {
    cleanup();
    applicationRoot.remove();
    vi.useRealTimers();
  });

  it("waits for both dashboard readiness and the three-second minimum before completing", async () => {
    const view = renderExperience();

    expect(screen.getByRole("status")).toHaveAttribute("data-startup-phase", "intro");
    expect(applicationRoot.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-startup-phase", "loading");

    view.rerender(
      <DashboardStartupExperience
        isAppReady
        isAppSettled
        hasCompleted={false}
        onComplete={onComplete}
        onPhaseChange={onPhaseChange}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-startup-phase", "complete");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(480);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(applicationRoot.inert).toBe(false);
    expect(applicationRoot).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("continues the loading loop when data resolves before the minimum duration", async () => {
    renderExperience({ isAppReady: true, isAppSettled: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-startup-phase", "loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-startup-phase", "complete");
  });

  it("uses the same readiness gate without motion and restores document state on unmount", async () => {
    motionState.reduceMotion = true;
    const view = renderExperience({ isAppReady: true, isAppSettled: true });

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    const secondView = renderExperience();
    expect(applicationRoot.inert).toBe(true);
    secondView.unmount();

    expect(applicationRoot.inert).toBe(false);
    expect(applicationRoot).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
    view.unmount();
  });
});
