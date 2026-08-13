import { Easing, interpolate, spring } from "remotion";

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const cubic = (t: number) => Easing.cubic(t);
const outCubic = (t: number) => Easing.out(cubic)(t);
const inOutCubic = (t: number) => Easing.inOut(cubic)(t);

export function easeOut(frame: number, start: number, duration = 18) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: outCubic,
  });
}

export function easeInOut(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {
    ...clamp,
    easing: inOutCubic,
  });
}

export function springIn(frame: number, fps: number, delay = 0) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 18, mass: 0.8, stiffness: 120 },
    durationInFrames: 26,
  });
}

export function sceneFade(frame: number, duration: number, fadeIn = 10, fadeOut = 14) {
  const enter = fadeIn === 0 ? 1 : interpolate(frame, [0, fadeIn], [0, 1], clamp);
  const exit =
    fadeOut === 0 ? 1 : interpolate(frame, [duration - fadeOut, duration], [1, 0], clamp);
  return Math.min(enter, exit);
}

export function stagger(index: number, gap = 7) {
  return index * gap;
}
