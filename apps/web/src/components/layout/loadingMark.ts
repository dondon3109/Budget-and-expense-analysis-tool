/**
 * Zoption loading mark.
 *
 * One idea: an ascender line rises across the frame and the Zoption monogram
 * draws itself over it, then both clear and the cycle repeats. Two elements,
 * one direction of travel, and no frame where the viewer cannot read the mark.
 *
 * Both are single strokes revealed with a dash offset rather than path morphs,
 * so the loop holds in every theme and at every size without shipping a picture
 * of it, and the two elements can never fall out of step.
 */

/** View box the mark is authored in. */
export const MARK_VIEW_BOX = "0 0 80 80";

/** The rule the monogram is set against. It rises 9 units across the frame. */
export const ASCENDER_PATH = "M4 61 L76 52";

/** The monogram, in the same monoline the app already uses for its Z. */
export const MONOGRAM_PATH = "M25 31 H55 L25 52 H55";

type Point = readonly [number, number];

const perimeter = (points: readonly Point[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1] as Point;
    const to = points[i] as Point;
    total += Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  return total;
};

export const ASCENDER_LENGTH = perimeter([
  [4, 61],
  [76, 52],
]);

export const MONOGRAM_LENGTH = perimeter([
  [25, 31],
  [55, 31],
  [25, 52],
  [55, 52],
]);

/** Hollow dash: reveal the whole stroke by moving the gap past it. */
export const MONOGRAM_DASH = `${MONOGRAM_LENGTH} ${MONOGRAM_LENGTH}`;

/**
 * Zero offset shows the whole stroke. A still frame has no motion to explain a
 * partly drawn mark, so the reduced-motion frame is simply the finished one.
 */
export const MONOGRAM_RESTING_OFFSET = 0;

/** One full cycle: the line rises, the mark draws, the pair holds, both clear. */
export const CYCLE_MS = 2000;

/**
 * Fractions of the cycle, in order: the line rises and finishes well before the
 * monogram starts drawing, so the mark lands on a completed rule; then the pair
 * holds still, and only then do both clear.
 */
export const LINE_COMPLETE_FRACTION = 0.08;
export const RISE_FRACTION = 0.4;
export const MARK_DRAW_FROM_FRACTION = 0.34;

/** Fraction of the cycle the line and the drawn mark sit still together. */
export const HOLD_FRACTION = 0.72;

/**
 * Between one keyframe and the next the value moves at a constant rate. Any
 * other easing here is applied to *every* segment, which compresses the whole
 * schedule into the first fraction of the cycle. The acceleration lives in the
 * offsets instead, where it can be read off directly.
 */
const STEP = "linear";

const between = (from: number, to: number, at: number) => from + (to - from) * at;

/** The line's draw-in eases off across two offsets before the rise finishes. */
const RULE_DRAWN_AT = 0.08;
const SLOPE_COMMITTED_AT = 0.2;

/** The monogram waits a beat, then starts drawing from the top-left corner. */
const MARK_WAITS_UNTIL_AT = 0.26;

/** Where both have cleared and the frame is empty before the next cycle. */
const CLEARED_AT = 0.85;

/**
 * The line draws itself from the left: a dash twice its length, offset from
 * "fully before the start" to "fully past the end".
 */
export function ascenderKeyframes(): Keyframe[] {
  const travel = ASCENDER_LENGTH * 2;
  const carried = -travel;
  return [
    { strokeDashoffset: travel, opacity: 0, offset: 0 },
    {
      strokeDashoffset: between(travel, carried, 0.86),
      opacity: 1,
      offset: RULE_DRAWN_AT,
    },
    {
      strokeDashoffset: between(travel, carried, 0.97),
      opacity: 1,
      offset: SLOPE_COMMITTED_AT,
    },
    { strokeDashoffset: carried, opacity: 1, offset: RISE_FRACTION },
    { strokeDashoffset: carried, opacity: 1, offset: HOLD_FRACTION },
    { strokeDashoffset: carried, opacity: 0.4, offset: 0.79 },
    { strokeDashoffset: carried, opacity: 0, offset: CLEARED_AT },
    { strokeDashoffset: carried, opacity: 0, offset: 1 },
  ];
}

/** The monogram draws on, holds while the line settles, then clears. */
export function monogramKeyframes(): Keyframe[] {
  const hidden = MONOGRAM_LENGTH;
  return [
    { strokeDashoffset: hidden, opacity: 0, offset: 0 },
    { strokeDashoffset: hidden, opacity: 0, offset: MARK_WAITS_UNTIL_AT },
    // The rule is already at full length here, so the mark draws onto a finished
    // line and the pair then holds still together.
    { strokeDashoffset: between(hidden, 0, 0.8), opacity: 1, offset: MARK_DRAW_FROM_FRACTION },
    { strokeDashoffset: 0, opacity: 1, offset: RISE_FRACTION },
    { strokeDashoffset: 0, opacity: 1, offset: HOLD_FRACTION },
    { strokeDashoffset: 0, opacity: 0.4, offset: 0.79 },
    { strokeDashoffset: 0, opacity: 0, offset: CLEARED_AT },
    { strokeDashoffset: 0, opacity: 0, offset: 1 },
  ];
}

export const ASCENDER_TIMING: KeyframeAnimationOptions = {
  duration: CYCLE_MS,
  iterations: Number.POSITIVE_INFINITY,
  easing: STEP,
};

export const MONOGRAM_TIMING: KeyframeAnimationOptions = {
  duration: CYCLE_MS,
  iterations: Number.POSITIVE_INFINITY,
  easing: STEP,
};
