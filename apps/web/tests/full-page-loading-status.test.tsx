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
  ASCENDER_LENGTH,
  HOLD_FRACTION,
  LINE_COMPLETE_FRACTION,
  MARK_DRAW_FROM_FRACTION,
  MONOGRAM_DASH,
  MONOGRAM_LENGTH,
  MONOGRAM_RESTING_OFFSET,
  RISE_FRACTION,
  ascenderKeyframes,
  monogramKeyframes,
} from "../src/components/layout/loadingMark";

const offsets = (frames: Keyframe[]) => frames.map((frame) => Number(frame.offset));

describe("loadingMark", () => {
  it("draws the line as a dash twice its own length", () => {
    const frames = ascenderKeyframes();
    expect(frames[0]?.strokeDashoffset).toBe(ASCENDER_LENGTH * 2);
    expect(frames.at(-1)?.strokeDashoffset).toBe(-ASCENDER_LENGTH * 2);
  });

  it("runs every keyframe track in strict time order", () => {
    for (const frames of [ascenderKeyframes(), monogramKeyframes()]) {
      const track = offsets(frames);
      expect(track[0]).toBe(0);
      expect(track.at(-1)).toBe(1);
      for (let i = 1; i < track.length; i++) {
        expect(track[i]!).toBeGreaterThan(track[i - 1]!);
      }
    }
  });

  it("starts the monogram hidden and finishes it fully drawn", () => {
    const frames = monogramKeyframes();
    expect(frames[0]?.strokeDashoffset).toBe(MONOGRAM_LENGTH);
    const drawn = frames.filter((frame) => frame.strokeDashoffset === 0 && frame.opacity === 1);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it("sequences the line before the mark, inside one cycle", () => {
    const line = ascenderKeyframes();
    const mark = monogramKeyframes();
    expect(LINE_COMPLETE_FRACTION).toBeLessThan(MARK_DRAW_FROM_FRACTION);
    expect(MARK_DRAW_FROM_FRACTION).toBeLessThan(RISE_FRACTION);
    expect(RISE_FRACTION).toBeLessThan(HOLD_FRACTION);
  });

  it("never leaves the frame empty for long enough to read as a blink", () => {
    const line = ascenderKeyframes();
    const mark = monogramKeyframes();
    const hidden = (frames: Keyframe[]) =>
      frames.filter((frame) => frame.opacity === 0).map((frame) => Number(frame.offset));
    const visibleFrom = (frames: Keyframe[]) =>
      Math.min(...frames.filter((frame) => frame.opacity === 1).map((f) => Number(f.offset)));
    const visibleUntil = (frames: Keyframe[]) =>
      Math.max(...frames.filter((frame) => frame.opacity === 1).map((f) => Number(f.offset)));

    // Each element is only hidden while it re-forms, at the very start or end.
    expect(Math.max(...hidden(line))).toBeGreaterThanOrEqual(0.85);
    expect(Math.min(...hidden(line))).toBeLessThanOrEqual(0.05);
    // The mark is fully drawn exactly while the rule is at full length, so the
    // composed frame is never both empty and still.
    expect(visibleFrom(mark)).toBeLessThanOrEqual(RISE_FRACTION);
    expect(visibleUntil(mark)).toBeGreaterThanOrEqual(HOLD_FRACTION);
    expect(visibleFrom(line)).toBeLessThanOrEqual(LINE_COMPLETE_FRACTION);
    expect(visibleUntil(line)).toBeGreaterThanOrEqual(HOLD_FRACTION);
  });

  it("keeps a readable resting frame for reduced motion", () => {
    // The whole stroke, because a still frame has no motion to explain a
    // partially drawn mark.
    expect(MONOGRAM_RESTING_OFFSET).toBe(0);
    // A hollow dash reveals the stroke; a shorter dash would only ever show a stub.
    const [dash, gap] = MONOGRAM_DASH.split(" ").map(Number);
    expect(dash).toBe(MONOGRAM_LENGTH);
    expect(gap).toBeGreaterThanOrEqual(MONOGRAM_LENGTH);
  });
});

/** jsdom ships no Web Animations, so stand one up and keep the real prototype. */
function stubAnimate() {
  const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, "animate");
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
  Object.defineProperty(SVGElement.prototype, "animate", { value: animate, configurable: true });
  return {
    animate,
    restore: () => {
      if (original) Object.defineProperty(SVGElement.prototype, "animate", original);
      else Reflect.deleteProperty(SVGElement.prototype, "animate");
    },
  };
}

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

  it("draws two elements instead of cross-fading several shapes", () => {
    const { container } = render(
      <FullPageLoadingStatus title="Restoring your workspace" description="Checking." />,
    );

    // A mark that changes identity mid-animation is the thing this replaced.
    const paths = container.querySelectorAll("svg path");
    expect(paths).toHaveLength(2);
    expect(container.querySelectorAll(".full-page-loading-line")).toHaveLength(1);
    expect(container.querySelectorAll(".full-page-loading-monogram")).toHaveLength(1);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("animates both elements with declarative keyframes", () => {
    const stub = stubAnimate();
    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);

    expect(stub.animate).toHaveBeenCalledTimes(2);
    const calls = stub.animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
    const [lineFrames, lineTiming] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    const [markFrames, markTiming] = calls[1] as [Keyframe[], KeyframeAnimationOptions];
    expect(lineFrames).toEqual(ascenderKeyframes());
    expect(markFrames).toEqual(monogramKeyframes());
    expect(lineTiming.iterations).toBe(Number.POSITIVE_INFINITY);
    expect(markTiming.iterations).toBe(Number.POSITIVE_INFINITY);
    expect(lineTiming.duration).toBe(markTiming.duration);

    cleanup();
    stub.restore();
  });

  it("cancels both animations when the surface goes away", () => {
    const cancel = vi.fn();
    const original = Object.getOwnPropertyDescriptor(SVGElement.prototype, "animate");
    Object.defineProperty(SVGElement.prototype, "animate", {
      value: vi.fn(() => ({ cancel }) as unknown as Animation),
      configurable: true,
    });

    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);
    cleanup();
    expect(cancel).toHaveBeenCalledTimes(2);

    if (original) Object.defineProperty(SVGElement.prototype, "animate", original);
    else Reflect.deleteProperty(SVGElement.prototype, "animate");
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

  it("holds a still, readable mark when motion is reduced", () => {
    motionState.reduceMotion = true;
    const stub = stubAnimate();

    render(<FullPageLoadingStatus title="Restoring your workspace" description="Checking." />);

    expect(screen.getByRole("status")).toHaveAttribute("data-reduced-motion");
    expect(stub.animate).not.toHaveBeenCalled();
    // The line is omitted entirely and the monogram keeps its resting frame.
    expect(document.querySelector(".full-page-loading-line")).toBeNull();
    expect(document.querySelector(".full-page-loading-monogram")).toHaveAttribute(
      "stroke-dashoffset",
      String(MONOGRAM_RESTING_OFFSET),
    );

    stub.restore();
  });

  it("holds the surface until the app is ready, then hands over on its exit", async () => {
    const stub = stubAnimate();
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

    stub.restore();
    if (original) Object.defineProperty(Element.prototype, "animate", original);
    else Reflect.deleteProperty(Element.prototype, "animate");
  });

  it("still hands over when the exit cannot animate", () => {
    const stub = stubAnimate();
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
    stub.restore();
  });

  it("completes immediately under reduced motion", () => {
    motionState.reduceMotion = true;
    const stub = stubAnimate();
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
    stub.restore();
  });
});
