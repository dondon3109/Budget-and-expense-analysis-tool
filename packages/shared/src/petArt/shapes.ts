// The pet art is plain shape data on a 200 × 200 canvas, so the same drawing renders through
// react-native-svg in the app and as SVG on the web (see docs/pet.md). Art colors are the pets'
// own and live here, not in the theme tokens.

/** One color stop of a gradient fill; `opacity` defaults to 1. */
export interface PetGradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

/**
 * A radial gradient fill in the shape's own bounding box (0 to 1 on each axis), the soft shading
 * that makes a pet read as a rounded figure. `fx`/`fy` move the brightest point off center.
 */
export interface PetGradient {
  cx: number;
  cy: number;
  r: number;
  fx?: number;
  fy?: number;
  stops: PetGradientStop[];
}

interface Paint {
  fill?: string | PetGradient;
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
  /** An SVG transform for the whole layer, such as a stage's scale around the pet's feet. */
  transform?: string;
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
  fill: string | PetGradient,
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

/** A soft contact shadow on the ground, darkest under the middle. */
export const groundShadow = (rx = 52): PetLayer => ({
  shapes: [
    oval(
      100,
      190,
      rx,
      8,
      {
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: "#2A1626", opacity: 0.3 },
          { offset: 0.6, color: "#2A1626", opacity: 0.13 },
          { offset: 1, color: "#2A1626", opacity: 0 },
        ],
      },
      { strokeWidth: 0 },
    ),
  ],
});
