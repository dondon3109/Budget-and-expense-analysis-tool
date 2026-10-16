import type { PetColor } from "../pet";

// A pet color recolors only the pet's body (fur, skin, feathers): the pictures through their body
// masks (scripts/generate-pet-masks.mjs), the SVG eggs through their body fills. Inside the body,
// each pixel's luminance picks a point between the color's dark and light ends, so shading and
// texture survive and every species turns the same pink. Art colors live here, not in the tokens.

type Rgb = readonly [number, number, number];

const ramps: Record<Exclude<PetColor, "original">, { dark: Rgb; light: Rgb }> = {
  pink: { dark: [0.62, 0.18, 0.38], light: [1, 0.86, 0.93] },
  mint: { dark: [0.1, 0.42, 0.32], light: [0.85, 1, 0.93] },
  sky: { dark: [0.12, 0.32, 0.62], light: [0.86, 0.95, 1] },
  lilac: { dark: [0.38, 0.22, 0.62], light: [0.95, 0.88, 1] },
  peach: { dark: [0.7, 0.33, 0.16], light: [1, 0.93, 0.85] },
};

// Rec. 709 luminance, the weights SVG's own luminance matrix uses.
const LUMINANCE: Rgb = [0.2126, 0.7152, 0.0722];

/**
 * The 4x5 `feColorMatrix type="matrix"` values (row-major, sRGB) that tint a picture to `color`,
 * or null for the original art. Apply it with color-interpolation-filters="sRGB" under the mask.
 */
export function petColorMatrix(color: PetColor): number[] | null {
  if (color === "original") return null;
  const { dark, light } = ramps[color];
  const row = (channel: 0 | 1 | 2) => {
    const span = light[channel] - dark[channel];
    return [...LUMINANCE.map((weight) => weight * span), 0, dark[channel]];
  };
  return [...row(0), ...row(1), ...row(2), 0, 0, 0, 1, 0];
}

const toHex = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

/** `#RRGGBB` tinted the way `petColorMatrix` tints a pixel of that color. */
export function tintPetHex(hex: string, color: PetColor): string {
  if (color === "original") return hex;
  const { dark, light } = ramps[color];
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const y = rgb.reduce((sum, value, index) => sum + value * LUMINANCE[index]!, 0);
  return `#${dark.map((end, index) => toHex(end + (light[index]! - end) * y)).join("")}`;
}

/** The dot a color picker shows: the color's middle tone. The original shows `fallback`. */
export function petColorSwatch(color: PetColor, fallback: string): string {
  if (color === "original") return fallback;
  return tintPetHex("#8C8C8C", color);
}
