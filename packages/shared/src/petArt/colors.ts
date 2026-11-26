import type { PetColor } from "../pet";

// A pet color recolors only the pet's body (fur, skin, feathers): the body fills of the eggs and
// the figures. Each body color's luminance picks a point between the color's dark and light ends,
// so shading survives and every species turns the same pink. Art colors live here, not in the tokens.

type Rgb = readonly [number, number, number];

const ramps: Record<Exclude<PetColor, "original">, { dark: Rgb; light: Rgb }> = {
  pink: { dark: [0.62, 0.18, 0.38], light: [1, 0.86, 0.93] },
  mint: { dark: [0.1, 0.42, 0.32], light: [0.85, 1, 0.93] },
  sky: { dark: [0.12, 0.32, 0.62], light: [0.86, 0.95, 1] },
  lilac: { dark: [0.38, 0.22, 0.62], light: [0.95, 0.88, 1] },
  peach: { dark: [0.7, 0.33, 0.16], light: [1, 0.93, 0.85] },
};

// Rec. 709 luminance.
const LUMINANCE: Rgb = [0.2126, 0.7152, 0.0722];

const toHex = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

/** `#RRGGBB` in a pet color, keeping its lightness. */
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
