// Pet art is plain shape data on a 200 × 200 canvas, so the same drawing renders through
// react-native-svg in the app and as an SVG string in tests and previews. Each layer names the
// body part it draws, so animations can move one part (blinking eyes, a wagging tail) on its own.
// Art colors are the pets' own and live here, not in the theme tokens; the app around them uses
// the tokens.

export type PetPart = "shadow" | "tail" | "ears" | "body" | "feet" | "arms" | "head" | "eyes";

interface Paint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export type PetShape =
  | (Paint & { kind: "path"; d: string })
  | (Paint & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate?: number })
  | (Paint & { kind: "circle"; cx: number; cy: number; r: number });

export interface PetLayer {
  part: PetPart;
  /** The point a part turns or squashes around. */
  origin: [number, number];
  shapes: PetShape[];
  /** A path the layer is clipped to, so patterns never spill past an outline. */
  clip?: string;
}

export type PetArt = PetLayer[];

export const OUTLINE = "#2B1D16";
export const LINE = 4.5;

export const line = (d: string, stroke = OUTLINE, strokeWidth = 3): PetShape => ({
  kind: "path",
  d,
  stroke,
  strokeWidth,
});

export const blob = (d: string, fill: string, stroke = OUTLINE): PetShape => ({
  kind: "path",
  d,
  fill,
  stroke,
  strokeWidth: LINE,
});

export const oval = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  extra: Partial<Paint> & { rotate?: number } = {},
): PetShape => ({
  kind: "ellipse",
  cx,
  cy,
  rx,
  ry,
  fill,
  stroke: OUTLINE,
  strokeWidth: LINE,
  ...extra,
});

export const dot = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  opacity?: number,
): PetShape => ({
  kind: "circle",
  cx,
  cy,
  r,
  fill,
  opacity,
});

/** Big glossy cartoon eyes. `whites` adds a white rim, for eyes drawn on dark fur. */
export function eyes(left: number, right: number, cy: number, size = 1, whites = false): PetLayer {
  const shapes: PetShape[] = [];
  for (const cx of [left, right]) {
    if (whites) shapes.push(oval(cx, cy, 11 * size, 13 * size, "#FFFFFF", { strokeWidth: 0 }));
    shapes.push(oval(cx, cy, 8.5 * size, 10.5 * size, OUTLINE, { strokeWidth: 0 }));
    shapes.push(dot(cx + 3 * size, cy - 4 * size, 3.6 * size, "#FFFFFF"));
    shapes.push(dot(cx - 3 * size, cy + 4 * size, 1.6 * size, "#FFFFFF"));
  }
  return { part: "eyes", origin: [(left + right) / 2, cy], shapes };
}

export const cheeks = (left: number, right: number, cy: number, fill = "#F48FA3"): PetShape[] => [
  oval(left, cy, 8, 5, fill, { strokeWidth: 0, opacity: 0.55 }),
  oval(right, cy, 8, 5, fill, { strokeWidth: 0, opacity: 0.55 }),
];

export const smile = (cx: number, cy: number, width = 6): PetShape =>
  line(`M${cx - width} ${cy} Q${cx} ${cy + width} ${cx + width} ${cy}`);

export const groundShadow = (rx = 52): PetLayer => ({
  part: "shadow",
  origin: [100, 190],
  shapes: [oval(100, 190, rx, 7, "#000000", { strokeWidth: 0, opacity: 0.12 })],
});

/** A closed zigzag ring, for spines and frost: `n` points between two angles (degrees). */
export function spikes(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  n: number,
  from: number,
  to: number,
): string {
  const point = (radius: number, degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return `${(cx + radius * Math.cos(radians)).toFixed(1)} ${(cy + radius * Math.sin(radians)).toFixed(1)}`;
  };
  const step = (to - from) / n;
  let d = `M${point(inner, from)}`;
  for (let i = 0; i < n; i += 1) {
    d += ` L${point(outer, from + step * (i + 0.5))} L${point(inner, from + step * (i + 1))}`;
  }
  return `${d} Z`;
}
