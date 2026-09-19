// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduceMotion: false }));

vi.mock("../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionState.reduceMotion,
}));

import { FullPageLoadingStatus } from "../src/components/layout/FullPageLoadingStatus";
import {
  MORPH_HOLD_MS,
  MORPH_PATHS,
  MORPH_SHAPE_COUNT,
  MORPH_TRANSITION_MS,
  easeInOutCubic,
  morphPathAt,
} from "../src/components/layout/loadingMark";

describe("loadingMark", () => {
  it("closes every silhouette so any state can morph into any other", () => {
    expect(MORPH_PATHS).toHaveLength(4);
    for (const d of MORPH_PATHS) {
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|undefined/);
    }
  });

  it("gives every silhouette the same structure so the morph never jumps", () => {
    const structure = (d: string) => d.replace(/-?\d+(\.\d+)?/g, "#");
    for (const d of MORPH_PATHS) {
      expect(structure(d)).toBe(structure(MORPH_PATHS[0]!));
    }
  });

  it("produces an in-between path that is neither of the two silhouettes", () => {
    const between = morphPathAt(0, 0.5);
    expect(between).not.toBe(MORPH_PATHS[0]);
    expect(between).not.toBe(MORPH_PATHS[1]);
    expect(between).not.toMatch(/NaN|undefined/);
  });

  it("holds the exact silhouette at the start of each step", () => {
    for (let index = 0; index < MORPH_SHAPE_COUNT; index++) {
      expect(morphPathAt(index, 0)).toBe(MORPH_PATHS[index]);
    }
    // The loop wraps: the last silhouette morphs back into the first.
    expect(morphPathAt(MORPH_SHAPE_COUNT, 0)).toBe(MORPH_PATHS[0]);
  });
});

describe("FullPageLoadingStatus", () => {
  beforeEach(() => {
    motionState.reduceMotion = false;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it("morphs the mark on the animation frame clock", () => {
    let callback: FrameRequestCallback | undefined;
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    // Stable origin so the frame timestamps below land where the test expects.
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
      callback = next;
      return 7;
    });

    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);

    const mark = document.querySelector<SVGPathElement>(".full-page-loading-mark");
    expect(mark?.getAttribute("d")).toBe(MORPH_PATHS[0]);

    // Halfway through the first morph: 1200ms of hold, then half of 620ms.
    act(() => {
      callback?.(MORPH_HOLD_MS + MORPH_TRANSITION_MS / 2);
    });

    expect(mark?.getAttribute("d")).not.toBe(MORPH_PATHS[0]);
    // React reserializes the attribute with its own spacing, and the loader
    // eases the blend before it asks for a frame.
    const normalize = (d: string | null | undefined) => d?.replace(/\s+/g, "");
    expect(normalize(mark?.getAttribute("d"))).toBe(normalize(morphPathAt(0, easeInOutCubic(0.5))));

    cleanup();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("keeps the mark still when motion is reduced", () => {
    motionState.reduceMotion = true;
    const frames = vi.spyOn(window, "requestAnimationFrame");

    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
    expect(frames).not.toHaveBeenCalled();
    expect(document.querySelector(".full-page-loading-mark")?.getAttribute("d")).toBe(
      MORPH_PATHS[0],
    );
  });

  it("hands over to the app once its exit has played", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    // jsdom ships no Web Animations, so stand one up to observe the handover.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
    const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
    const onComplete = vi.fn();

    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        onComplete={onComplete}
      />,
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], expect.anything());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    if (original) Object.defineProperty(Element.prototype, "animate", original);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  it("still hands over when the exit cannot animate", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    // jsdom has no Element.animate, which is the same path a reduced-capability
    // browser takes: hand over rather than hold the workspace behind the splash.
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
    Object.defineProperty(Element.prototype, "animate", { value: undefined, configurable: true });
    const onComplete = vi.fn();

    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        onComplete={onComplete}
      />,
    );

    expect(onComplete).toHaveBeenCalledTimes(1);

    if (original) Object.defineProperty(Element.prototype, "animate", original);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  it("completes immediately under reduced motion", () => {
    motionState.reduceMotion = true;
    const onComplete = vi.fn();

    render(
      <FullPageLoadingStatus
        title="Restoring your workspace"
        description="Checking."
        onComplete={onComplete}
      />,
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
