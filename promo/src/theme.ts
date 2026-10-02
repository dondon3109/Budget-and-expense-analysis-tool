import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./timing";

// Dark theme tokens from packages/web-common/src/styles/tokens.css and the logo SVG.
export const C = {
  bg: "#0e1312",
  surface: "#131918",
  surfaceHover: "#1b2321",
  line: "rgba(237, 242, 240, 0.09)",
  ink: "#edf2f0",
  inkSoft: "rgba(237, 242, 240, 0.62)",
  brand: "#5fe3b8",
  brandStrong: "#a4f2d7",
  brandSoft: "#0f3a2d",
  brandMid: "#2f9e7c",
  danger: "#ff8b82",
  cream: "#f7f3ea",
  logoBg: "#0c1512",
} as const;

export const FONT = {
  display: '"Bricolage Grotesque", "Geist", system-ui, sans-serif',
  ui: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
} as const;

/** Fast-out, slow-settle curve used for almost every entrance. */
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 progress of `frame` between `start` and `start + dur`. */
export const prog = (frame: number, start: number, dur: number, easing = ease) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Springy pop starting at `delay`; overshoots slightly. */
export const pop = (frame: number, delay = 0, damping = 11, stiffness = 150) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass: 0.7 } });

/** Crisp spring with almost no overshoot, for UI that should feel precise. */
export const settle = (frame: number, delay = 0) =>
  spring({ frame: frame - delay, fps: FPS, config: { damping: 22, stiffness: 170, mass: 0.8 } });

/** Deterministic pseudo-random so every render of a frame is identical. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const peso = (minor: number) =>
  `₱${(minor / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
