export const categoryColorOptions = [
  { name: "Emerald", value: "#0F766E" },
  { name: "Blue", value: "#2563EB" },
  { name: "Violet", value: "#7C3AED" },
  { name: "Pink", value: "#DB2777" },
  { name: "Red", value: "#DC2626" },
  { name: "Orange", value: "#EA580C" },
  { name: "Amber", value: "#D97706" },
  { name: "Slate", value: "#475569" },
] as const;

export function isPresetCategoryColor(color: string): boolean {
  return categoryColorOptions.some((option) => option.value.toLowerCase() === color.toLowerCase());
}

/** Hue in degrees (0-360), saturation and value as fractions (0-1). */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number): string => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}

/** Returns null for anything but a complete six-digit hex code. */
export function hexToHsv(hex: string): Hsv | null {
  const match = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/i.exec(hex);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0 && max === r) h = 60 * (((g - b) / delta + 6) % 6);
  else if (delta > 0 && max === g) h = 60 * ((b - r) / delta + 2);
  else if (delta > 0) h = 60 * ((r - g) / delta + 4);
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}
