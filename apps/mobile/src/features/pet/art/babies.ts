import type { PetSpecies } from "@zoption/shared";

import {
  blob,
  cheeks,
  dot,
  eyes,
  groundShadow,
  line,
  OUTLINE,
  oval,
  smile,
  spikes,
  type PetArt,
  type PetLayer,
} from "./shapes";

// Babies share one chibi build: a big round head over a small body, stubby feet and arms.

const feet = (fill: string): PetLayer => ({
  part: "feet",
  origin: [100, 182],
  shapes: [oval(80, 182, 13, 7, fill), oval(120, 182, 13, 7, fill)],
});

const body = (fill: string, belly: string): PetLayer => ({
  part: "body",
  origin: [100, 180],
  shapes: [oval(100, 150, 44, 34, fill), oval(100, 158, 27, 20, belly, { strokeWidth: 0 })],
});

const arms = (fill: string): PetLayer => ({
  part: "arms",
  origin: [100, 150],
  shapes: [
    oval(62, 150, 10, 15, fill, { rotate: 25 }),
    oval(138, 150, 10, 15, fill, { rotate: -25 }),
  ],
});

const hedgehog: PetArt = [
  groundShadow(50),
  feet("#5C3B22"),
  body("#7A4E2D", "#F3DCB4"),
  arms("#F3DCB4"),
  {
    part: "ears",
    origin: [100, 56],
    shapes: [oval(62, 56, 11, 11, "#F3DCB4"), oval(138, 56, 11, 11, "#F3DCB4")],
  },
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      blob(spikes(100, 94, 50, 68, 13, 160, 380), "#7A4E2D"),
      oval(100, 96, 52, 50, "#7A4E2D"),
      oval(100, 108, 42, 34, "#F3DCB4", { strokeWidth: 0 }),
      oval(100, 112, 7, 5, OUTLINE, { strokeWidth: 0 }),
      dot(102, 110, 1.8, "#FFFFFF"),
      smile(100, 124, 5),
      ...cheeks(70, 130, 116),
    ],
  },
  eyes(80, 120, 98),
];

const pig: PetArt = [
  groundShadow(50),
  feet("#E8899E"),
  {
    part: "tail",
    origin: [140, 156],
    shapes: [line("M140 160 c14 0 20 -14 11 -18 c-8 -3 -9 9 0 9", "#E07A94", 4)],
  },
  body("#F7B3C2", "#FBD0DA"),
  arms("#F7B3C2"),
  {
    part: "ears",
    origin: [100, 48],
    shapes: [
      blob("M60 58 L50 24 L86 42 Z", "#F7B3C2"),
      { kind: "path", d: "M62 52 L57 34 L77 44 Z", fill: "#EE8FA6" },
      blob("M140 58 L150 24 L114 42 Z", "#F7B3C2"),
      { kind: "path", d: "M138 52 L143 34 L123 44 Z", fill: "#EE8FA6" },
    ],
  },
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      oval(100, 94, 54, 52, "#F7B3C2"),
      oval(100, 116, 18, 12, "#F08FA7"),
      oval(93, 116, 3, 4.5, OUTLINE, { strokeWidth: 0 }),
      oval(107, 116, 3, 4.5, OUTLINE, { strokeWidth: 0 }),
      smile(100, 133, 5),
      ...cheeks(66, 134, 112),
    ],
  },
  eyes(80, 120, 92),
];

const hamster: PetArt = [
  groundShadow(50),
  feet("#F4A3A8"),
  body("#F2A64A", "#FCE6C2"),
  {
    part: "arms",
    origin: [100, 152],
    shapes: [oval(86, 152, 8, 6, "#F4A3A8"), oval(114, 152, 8, 6, "#F4A3A8")],
  },
  {
    part: "ears",
    origin: [100, 50],
    shapes: [
      oval(60, 50, 15, 15, "#F2A64A"),
      oval(60, 50, 8, 8, "#F4A3A8", { strokeWidth: 0 }),
      oval(140, 50, 15, 15, "#F2A64A"),
      oval(140, 50, 8, 8, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      oval(100, 94, 56, 50, "#F2A64A"),
      oval(72, 116, 22, 17, "#FCE6C2", { strokeWidth: 0 }),
      oval(128, 116, 22, 17, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 118, 16, 12, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 109, 4.5, 3.2, "#E77C8C", { strokeWidth: 0 }),
      line("M92 118 Q96 123 100 118 Q104 123 108 118"),
      ...cheeks(70, 130, 108),
    ],
  },
  eyes(80, 120, 92),
];

const penguin: PetArt = [
  groundShadow(48),
  feet("#F5A33A"),
  body("#A0A8B4", "#FFFFFF"),
  arms("#6E7784"),
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      blob("M92 44 l4 -12 l4 10 l5 -12 l3 14 Z", "#A0A8B4"),
      oval(100, 92, 52, 50, "#A0A8B4"),
      {
        kind: "path",
        d: "M100 76 C112 60 142 68 140 96 C138 120 118 134 100 134 C82 134 62 120 60 96 C58 68 88 60 100 76 Z",
        fill: "#FFFFFF",
      },
      blob("M91 110 L109 110 L100 121 Z", "#F5A33A"),
      ...cheeks(70, 130, 112),
    ],
  },
  eyes(80, 120, 94),
];

const panda: PetArt = [
  groundShadow(50),
  feet("#24242C"),
  body("#FAFAF5", "#FFFFFF"),
  {
    part: "arms",
    origin: [100, 146],
    shapes: [
      oval(70, 146, 11, 15, "#24242C", { rotate: 35 }),
      oval(130, 146, 11, 15, "#24242C", { rotate: -35 }),
      blob("M88 170 C92 152 112 146 122 150 C118 162 104 172 88 170 Z", "#6CBF45"),
    ],
  },
  {
    part: "ears",
    origin: [100, 48],
    shapes: [oval(58, 48, 15, 15, "#24242C"), oval(142, 48, 15, 15, "#24242C")],
  },
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      oval(100, 94, 55, 50, "#FAFAF5"),
      oval(79, 98, 15, 19, "#24242C", { strokeWidth: 0, rotate: 25 }),
      oval(121, 98, 15, 19, "#24242C", { strokeWidth: 0, rotate: -25 }),
      oval(100, 116, 7, 5, OUTLINE, { strokeWidth: 0 }),
      smile(100, 127, 5),
      ...cheeks(66, 134, 120),
    ],
  },
  eyes(80, 120, 97, 0.85, true),
];

const hippo: PetArt = [
  {
    part: "shadow",
    origin: [100, 188],
    shapes: [
      oval(100, 186, 68, 11, "#9BD8F0", { strokeWidth: 0, opacity: 0.85 }),
      line("M58 188 q8 -5 16 0 M126 188 q8 -5 16 0", "#E8F7FD", 3),
    ],
  },
  feet("#8F88B0"),
  body("#A9A3C6", "#C9C3E0"),
  arms("#A9A3C6"),
  {
    part: "ears",
    origin: [100, 46],
    shapes: [
      oval(64, 46, 10, 8, "#A9A3C6"),
      oval(64, 46, 5, 4, "#F4A3A8", { strokeWidth: 0 }),
      oval(136, 46, 10, 8, "#A9A3C6"),
      oval(136, 46, 5, 4, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 140],
    shapes: [
      oval(100, 88, 52, 46, "#A9A3C6"),
      oval(100, 118, 40, 25, "#C3BDDD"),
      oval(88, 113, 4, 3, "#4B4566", { strokeWidth: 0 }),
      oval(112, 113, 4, 3, "#4B4566", { strokeWidth: 0 }),
      smile(100, 126, 9),
      ...cheeks(64, 136, 104),
    ],
  },
  eyes(82, 118, 82),
];

export const babyArt: Record<PetSpecies, PetArt> = {
  hedgehog,
  pig,
  hamster,
  penguin,
  panda,
  hippo,
};
