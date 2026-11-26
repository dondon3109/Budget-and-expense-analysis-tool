import type { PetColor, PetSpecies } from "../pet";

import { tintPetHex } from "./colors";

import {
  dot,
  groundShadow,
  line,
  OUTLINE,
  type PetArt,
  type PetLayer,
  type PetShape,
} from "./shapes";

const EGG =
  "M100 16 C142 16 170 78 170 118 C170 160 140 188 100 188 C60 188 30 160 30 118 C30 78 58 16 100 16 Z";
/** The lower band of the egg, for a belly, ice, or water base. */
const BASE = "M33 146 C60 158 140 158 167 146 C160 174 134 188 100 188 C66 188 40 174 33 146 Z";

const shell = (fill: string): PetShape => ({ kind: "path", d: EGG, fill });
// A thin warm outline and soft lighting, so the egg sits beside the vinyl figures it hatches into.
const outline: PetShape = {
  kind: "path",
  d: EGG,
  stroke: "#5A3A3A",
  strokeWidth: 2.5,
  opacity: 0.55,
};
/** Light from the upper left over a shaded lower right, laid over the pattern. */
const shading: PetShape = {
  kind: "path",
  d: EGG,
  fill: {
    cx: 0.44,
    cy: 0.4,
    r: 0.7,
    fx: 0.34,
    fy: 0.22,
    stops: [
      { offset: 0, color: "#FFFFFF", opacity: 0.5 },
      { offset: 0.42, color: "#FFFFFF", opacity: 0 },
      { offset: 0.84, color: "#2A1626", opacity: 0.2 },
      { offset: 1, color: "#2A1626", opacity: 0.3 },
    ],
  },
};
const shine: PetShape = {
  kind: "ellipse",
  cx: 72,
  cy: 62,
  rx: 10,
  ry: 20,
  rotate: 24,
  fill: {
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
    stops: [
      { offset: 0, color: "#FFFFFF", opacity: 0.8 },
      { offset: 1, color: "#FFFFFF", opacity: 0 },
    ],
  },
};

const patterns: Record<PetSpecies, PetShape[]> = {
  pig: [
    shell("#F6A9B8"),
    dot(70, 70, 10, "#E98AA0"),
    dot(128, 92, 13, "#E98AA0"),
    dot(84, 132, 9, "#E98AA0"),
    dot(124, 154, 8, "#E98AA0"),
    dot(62, 160, 6, "#E98AA0"),
    line("M140 122 c0 -12 16 -12 16 0 c0 9 -11 9 -11 2", "#C9607A", 4),
  ],
  hippo: [
    shell("#A7A1C6"),
    dot(74, 64, 8, "#C9C3E0"),
    dot(124, 74, 11, "#C9C3E0"),
    dot(92, 106, 6, "#C9C3E0"),
    dot(140, 118, 7, "#C9C3E0"),
    { kind: "path", d: BASE, fill: "#86CDEB" },
    line(
      "M46 162 q8 -6 16 0 q8 6 16 0 q8 -6 16 0 q8 6 16 0 q8 -6 16 0 q8 6 16 0 q8 -6 16 0",
      "#E8F7FD",
      3,
    ),
  ],
};

/** The zigzag crack, revealed a little more each consecutive day toward hatching. */
const CRACK_POINTS = [
  [118, 30],
  [110, 44],
  [122, 54],
  [108, 68],
  [120, 80],
  [104, 94],
  [116, 106],
  [100, 118],
];
const SIDE_CRACK = "M44 104 L56 100 L52 112 L66 110 L62 122";

/** Cracks that spread from the main one as a ready egg is tapped, one more every two taps. */
const TAP_CRACKS = [
  "M120 84 L132 92 L128 104 L142 110",
  "M100 118 L90 128 L98 138 L86 148",
  "M86 40 L94 52 L84 60 L92 70",
  "M138 130 L150 126 L146 140 L158 144",
  "M60 140 L72 136 L70 150 L82 154",
];

/** The cracks for `days` of streak and, once the egg is ready, `taps` toward breaking it open. */
export function eggCracks(days: number, taps = 0): PetShape[] {
  if (days <= 0) return [];
  const visible = CRACK_POINTS.slice(0, Math.min(days, 7) + 1);
  const d = visible.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const cracks = [line(d, OUTLINE, 3)];
  if (days >= 5) cracks.push(line(SIDE_CRACK, OUTLINE, 3));
  for (const crack of TAP_CRACKS.slice(0, Math.ceil(taps / 2)))
    cracks.push(line(crack, OUTLINE, 3));
  return cracks;
}

// The fills that are the egg's body, which a pet color tints; the rest (bellies, seeds, water,
// bamboo) keeps its color, like the pictures' body masks.
const bodyFills: Record<PetSpecies, string[]> = {
  pig: ["#F6A9B8", "#E98AA0"],
  hippo: ["#A7A1C6", "#C9C3E0"],
};

function tinted(species: PetSpecies, color: PetColor): PetShape[] {
  if (color === "original") return patterns[species];
  const body = bodyFills[species];
  return patterns[species].map((shape) =>
    typeof shape.fill === "string" && body.includes(shape.fill)
      ? { ...shape, fill: tintPetHex(shape.fill, color) }
      : shape,
  );
}

/**
 * An egg of each species in its pet color, with the crack for `days` consecutive login days and
 * `taps` to hatch.
 */
export function eggArt(
  species: PetSpecies,
  days = 0,
  taps = 0,
  color: PetColor = "original",
): PetArt {
  return [
    groundShadow(56),
    { clip: EGG, shapes: [...tinted(species, color), shading] },
    { shapes: [shine, outline, ...eggCracks(days, taps)] },
  ];
}

const SHINE = "#FFF1A8";

/** The light that bursts out of a cracking egg: a warm glow with rays, centered on the shell. */
export function hatchShineLayer(): PetLayer {
  const rays = Array.from({ length: 12 }, (_, index): PetShape => {
    const angle = (index * Math.PI) / 6;
    const [inner, outer] = index % 2 === 0 ? [52, 96] : [56, 82];
    const point = (radius: number) =>
      `${Math.round(100 + Math.cos(angle) * radius)} ${Math.round(112 + Math.sin(angle) * radius)}`;
    return line(`M${point(inner)} L${point(outer)}`, SHINE, 7);
  });
  return {
    shapes: [{ kind: "circle", cx: 100, cy: 112, r: 50, fill: SHINE, opacity: 0.85 }, ...rays],
  };
}
