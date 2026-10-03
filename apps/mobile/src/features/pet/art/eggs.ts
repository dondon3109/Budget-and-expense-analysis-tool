import type { PetSpecies } from "@zoption/shared";

import {
  blob,
  dot,
  groundShadow,
  line,
  LINE,
  OUTLINE,
  oval,
  type PetArt,
  type PetShape,
} from "./shapes";

const EGG =
  "M100 16 C142 16 170 78 170 118 C170 160 140 188 100 188 C60 188 30 160 30 118 C30 78 58 16 100 16 Z";
/** The lower band of the egg, for a belly, ice, or water base. */
const BASE = "M33 146 C60 158 140 158 167 146 C160 174 134 188 100 188 C66 188 40 174 33 146 Z";

const shell = (fill: string): PetShape => ({ kind: "path", d: EGG, fill });
const outline: PetShape = { kind: "path", d: EGG, stroke: OUTLINE, strokeWidth: LINE };
const shine: PetShape = oval(70, 66, 11, 22, "#FFFFFF", {
  strokeWidth: 0,
  opacity: 0.45,
  rotate: 20,
});

const triangle = (x: number, y: number): string =>
  `M${x - 6} ${y + 6} L${x} ${y - 8} L${x + 6} ${y + 6} Z`;

function seed(x: number, y: number, rotate: number): PetShape[] {
  return [
    oval(x, y, 5, 9, "#3E2C20", { strokeWidth: 0, rotate }),
    oval(x, y, 1.4, 6, "#F5E9D3", { strokeWidth: 0, rotate }),
  ];
}

function zigzag(fromX: number, toX: number, y: number, rise: number): string {
  let d = `M${fromX} ${y}`;
  for (let x = fromX; x < toX; x += 8) d += ` l4 ${rise} l4 ${-rise}`;
  return d;
}

const patterns: Record<PetSpecies, PetShape[]> = {
  hedgehog: [
    shell("#B07A45"),
    blob(BASE, "#F2DDB6"),
    ...[
      [78, 46],
      [100, 34],
      [122, 46],
      [64, 74],
      [88, 66],
      [112, 66],
      [136, 74],
      [78, 98],
      [102, 92],
      [126, 100],
    ].map(([x, y]) => ({ kind: "path" as const, d: triangle(x!, y!), fill: "#6B4527" })),
  ],
  pig: [
    shell("#F6A9B8"),
    dot(70, 70, 10, "#E98AA0"),
    dot(128, 92, 13, "#E98AA0"),
    dot(84, 132, 9, "#E98AA0"),
    dot(124, 154, 8, "#E98AA0"),
    dot(62, 160, 6, "#E98AA0"),
    line("M140 122 c0 -12 16 -12 16 0 c0 9 -11 9 -11 2", "#C9607A", 4),
  ],
  hamster: [
    shell("#F0A040"),
    oval(100, 146, 50, 36, "#FCE6C2", { strokeWidth: 0 }),
    ...seed(70, 62, -25),
    ...seed(118, 50, 20),
    ...seed(138, 90, 35),
    ...seed(62, 102, -10),
    ...seed(100, 84, 0),
  ],
  penguin: [
    shell("#2C3340"),
    blob(
      "M100 62 C132 62 152 100 152 132 C152 164 128 184 100 184 C72 184 48 164 48 132 C48 100 68 62 100 62 Z",
      "#FFFFFF",
      "#2C3340",
    ),
    { kind: "path", d: BASE, fill: "#BFE7F7" },
    line(zigzag(38, 162, 152, 6), "#FFFFFF", 3),
  ],
  panda: [
    shell("#FAFAF5"),
    {
      kind: "path",
      d: "M50 72 C46 44 80 30 96 44 C106 54 92 78 74 82 C62 84 52 80 50 72 Z",
      fill: "#24242C",
    },
    {
      kind: "path",
      d: "M152 110 C168 104 172 130 164 146 C156 160 136 156 138 140 C140 126 142 114 152 110 Z",
      fill: "#24242C",
    },
    oval(84, 162, 14, 10, "#24242C", { strokeWidth: 0 }),
    blob("M112 66 C128 42 156 40 164 48 C150 60 132 72 112 66 Z", "#6CBF45"),
    line("M115 65 C130 56 146 50 160 48", "#3F8A2A", 2),
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

export function eggCracks(days: number): PetShape[] {
  if (days <= 0) return [];
  const visible = CRACK_POINTS.slice(0, Math.min(days, 7) + 1);
  const d = visible.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const cracks = [line(d, OUTLINE, 3)];
  if (days >= 5) cracks.push(line(SIDE_CRACK, OUTLINE, 3));
  return cracks;
}

/** An egg of each species, with the crack for `days` consecutive login days. */
export function eggArt(species: PetSpecies, days = 0): PetArt {
  return [
    groundShadow(56),
    { part: "body", origin: [100, 186], clip: EGG, shapes: patterns[species] },
    { part: "body", origin: [100, 186], shapes: [shine, outline, ...eggCracks(days)] },
  ];
}
