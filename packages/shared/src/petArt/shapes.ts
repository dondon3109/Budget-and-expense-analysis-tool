// The egg art is plain shape data on a 200 × 200 canvas, so the same drawing renders through
// react-native-svg in the app and as SVG on the web. Hatched pets are Grok pictures instead (see
// docs/pet.md). Art colors are the eggs' own and live here, not in the theme tokens.

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

export const groundShadow = (rx = 52): PetLayer => ({
  shapes: [oval(100, 190, rx, 7, "#000000", { strokeWidth: 0, opacity: 0.12 })],
});
