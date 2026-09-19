/**
 * Zoption loading mark: one continuous 2px stroke that morphs between four
 * financial silhouettes — monogram, ascending bars, coin, banknote — then loops.
 *
 * Every silhouette is authored as a point list and resampled to a shared vertex
 * count, so any state interpolates into any other without a jump. Path strings
 * and the frames between them are produced once per pair and cached; the loading
 * surface only reads one string per animation frame.
 */

const TENSION = 0.35;
const SAMPLES = 48;
const MORPH_FRAMES = 48;

export type Point = readonly [number, number];

/** Index that must exist: shapes are authored, so an out-of-range read is a bug. */
function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`loadingMark: missing index ${index}`);
  return value;
}

const norm = (v: Point): Point => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};

/** Closed outline around an open monoline polyline: one side out, the other back. */
function glyphOutline(centerline: readonly Point[], weight: number): Point[] {
  const half = weight / 2;
  const last = centerline.length - 1;
  const normals: Point[] = [];
  for (let i = 0; i < last; i++) {
    const from = at(centerline, i);
    const to = at(centerline, i + 1);
    const segment = norm([to[0] - from[0], to[1] - from[1]]);
    normals.push([-segment[1], segment[0]]);
  }
  const miterAt = (i: number): Point => {
    const before = i === 0 ? at(normals, 0) : at(normals, i - 1);
    const after = i === last ? at(normals, last - 1) : at(normals, i);
    const miter = norm([before[0] + after[0], before[1] + after[1]]);
    const cos = Math.max(0.35, miter[0] * before[0] + miter[1] * before[1]);
    return [(miter[0] * half) / cos, (miter[1] * half) / cos];
  };
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= last; i++) {
    const point = at(centerline, i);
    const m = miterAt(i);
    left.push([point[0] + m[0], point[1] + m[1]]);
    right.push([point[0] - m[0], point[1] - m[1]]);
  }
  return [...left, ...right.reverse()];
}

/** Authored silhouettes in the order the loader cycles through them. */
const SHAPES: readonly (readonly Point[])[] = [
  glyphOutline(
    [
      [22, 22],
      [58, 22],
      [22, 58],
      [58, 58],
    ],
    7,
  ),
  [
    [14, 74],
    [14, 50],
    [24, 50],
    [24, 74],
    [30, 74],
    [32, 34],
    [42, 34],
    [42, 74],
    [48, 74],
    [50, 22],
    [60, 22],
    [60, 74],
  ],
  Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2 - Math.PI / 2;
    return [40 + 27 * Math.cos(angle), 40 + 27 * Math.sin(angle)] as Point;
  }),
  [
    [9, 24],
    [71, 24],
    [71, 56],
    [9, 56],
    [9, 50],
    [13, 50],
    [13, 30],
    [9, 30],
  ],
];

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const round = (value: number) => Math.round(value * 100) / 100;
const pair = (a: number, b: number) => `${round(a)} ${round(b)}`;

/** Uniform arc-length resample so every silhouette shares one vertex count. */
function resample(points: readonly Point[], count: number): Point[] {
  const ring: Point[] = [...points, at(points, 0)];
  const spans = ring.slice(1).map((point, index) => distance(at(ring, index), point));
  const total = spans.reduce((sum, span) => sum + span, 0);
  const out: Point[] = [];
  let span = 0;
  let walked = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    while (span < spans.length - 1 && walked + at(spans, span) < target) {
      walked += at(spans, span);
      span += 1;
    }
    const start = at(ring, span);
    const end = at(ring, span + 1);
    const current = at(spans, span);
    const t = current === 0 ? 0 : (target - walked) / current;
    out.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
  }
  return out;
}

/** Cubic path through the samples: authored vertices stay sharp, the rest stays smooth. */
function buildPath(points: readonly Point[]): string {
  const sampled = resample(points, SAMPLES);
  const corners = new Set<number>();
  for (const corner of points) {
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    sampled.forEach((point, index) => {
      const span = distance(point, corner);
      if (span < closestDistance) {
        closestDistance = span;
        closest = index;
      }
    });
    corners.add(closest);
  }
  const count = sampled.length;
  const [firstX, firstY] = at(sampled, 0);
  let d = `M${pair(firstX, firstY)}`;
  for (let i = 0; i < count; i++) {
    const [previousX, previousY] = at(sampled, (i - 1 + count) % count);
    const [currentX, currentY] = at(sampled, i);
    const [nextX, nextY] = at(sampled, (i + 1) % count);
    const [followingX, followingY] = at(sampled, (i + 2) % count);
    const sharp = corners.has(i) || corners.has((i + 1) % count);
    // At an authored vertex both handles stay on the span, which is exactly the
    // line segment needed to keep it sharp.
    const control1X = sharp
      ? currentX + (nextX - currentX) / 3
      : currentX + (nextX - previousX) * (TENSION / 3);
    const control1Y = sharp
      ? currentY + (nextY - currentY) / 3
      : currentY + (nextY - previousY) * (TENSION / 3);
    const control2X = sharp
      ? nextX - (nextX - currentX) / 3
      : nextX - (followingX - currentX) * (TENSION / 3);
    const control2Y = sharp
      ? nextY - (nextY - currentY) / 3
      : nextY - (followingY - currentY) * (TENSION / 3);
    d += `C${pair(control1X, control1Y)} ${pair(control2X, control2Y)} ${pair(nextX, nextY)}`;
  }
  return `${d}Z`;
}

/** One path string per silhouette. */
export const MORPH_PATHS: readonly string[] = SHAPES.map(buildPath);

/** Structural path tokens: each command letter or number, in a stable order. */
const tokenize = (d: string): string[] => d.match(/[MCZ]|-?\d+(?:\.\d+)?/g) ?? [];

const TOKENS = MORPH_PATHS.map(tokenize);
const morphCache = new Map<number, string[]>();

function morphFrames(fromIndex: number, toIndex: number): string[] {
  const cacheKey = fromIndex * MORPH_PATHS.length + toIndex;
  const cached = morphCache.get(cacheKey);
  if (cached) return cached;
  const from = at(TOKENS, fromIndex);
  const to = at(TOKENS, toIndex);
  const frames: string[] = [];
  for (let frame = 0; frame < MORPH_FRAMES; frame++) {
    const t = frame / (MORPH_FRAMES - 1);
    frames.push(
      from
        .map((token, index) => {
          const target = to[index];
          if (target === undefined || token === target) return token;
          const start = Number(token);
          const end = Number(target);
          if (Number.isNaN(start) || Number.isNaN(end)) return t < 0.5 ? token : target;
          return String(round(start + (end - start) * t));
        })
        .join(" "),
    );
  }
  morphCache.set(cacheKey, frames);
  return frames;
}

/** Ease in and out of each silhouette so the loop reads as deliberate, not mechanical. */
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Path for one moment of the loop. A blend of 0 holds the silhouette exactly;
 * values above 0 interpolate toward the next one.
 */
export function morphPathAt(shapeIndex: number, blend: number): string {
  const count = MORPH_PATHS.length;
  const current = ((shapeIndex % count) + count) % count;
  if (blend <= 0) return at(MORPH_PATHS, current);
  const frames = morphFrames(current, (current + 1) % count);
  const index = Math.min(frames.length - 1, Math.round(blend * (frames.length - 1)));
  return at(frames, index);
}

/** How many silhouettes the loop passes through. */
export const MORPH_SHAPE_COUNT = MORPH_PATHS.length;

/** How long one silhouette holds, and how long a morph between two of them takes. */
export const MORPH_HOLD_MS = 1200;
export const MORPH_TRANSITION_MS = 620;
