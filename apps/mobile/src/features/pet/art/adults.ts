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

// Adults are big and calm: a round, heavy body with the head sitting on top.

const feet = (fill: string): PetLayer => ({
  part: "feet",
  origin: [100, 184],
  shapes: [oval(72, 184, 17, 8, fill), oval(128, 184, 17, 8, fill)],
});

const body = (fill: string, belly: string): PetLayer => ({
  part: "body",
  origin: [100, 184],
  shapes: [oval(100, 140, 58, 46, fill), oval(100, 150, 38, 30, belly, { strokeWidth: 0 })],
});

const arms = (fill: string): PetLayer => ({
  part: "arms",
  origin: [100, 140],
  shapes: [
    oval(50, 142, 12, 20, fill, { rotate: 25 }),
    oval(150, 142, 12, 20, fill, { rotate: -25 }),
  ],
});

const hedgehog: PetArt = [
  groundShadow(62),
  feet("#5C3B22"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      blob(spikes(100, 136, 50, 76, 15, 140, 400), "#5E3D22"),
      blob(spikes(100, 136, 44, 62, 13, 150, 390), "#7A4E2D"),
      oval(100, 142, 56, 44, "#7A4E2D"),
      oval(100, 152, 36, 28, "#F3DCB4", { strokeWidth: 0 }),
    ],
  },
  arms("#F3DCB4"),
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 82, 40, 36, "#7A4E2D"),
      oval(100, 94, 32, 24, "#F3DCB4", { strokeWidth: 0 }),
      oval(100, 96, 7, 5, OUTLINE, { strokeWidth: 0 }),
      dot(102, 94, 1.8, "#FFFFFF"),
      smile(100, 110, 6),
      ...cheeks(76, 124, 98),
    ],
  },
  eyes(84, 116, 78, 0.8),
];

/** The pig grows into a boar. */
const pig: PetArt = [
  groundShadow(62),
  feet("#6E3F33"),
  {
    part: "tail",
    origin: [154, 140],
    shapes: [line("M154 140 c14 -2 18 -14 10 -18", "#6E3F33", 4)],
  },
  body("#A8665A", "#C98C7E"),
  arms("#A8665A"),
  {
    part: "ears",
    origin: [100, 42],
    shapes: [
      blob("M66 52 L58 22 L88 40 Z", "#A8665A"),
      blob("M134 52 L142 22 L112 40 Z", "#A8665A"),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      blob(spikes(100, 74, 34, 50, 7, 215, 325), "#5A342A"),
      oval(100, 80, 44, 38, "#A8665A"),
      oval(100, 100, 20, 13, "#C98C7E"),
      oval(93, 100, 3.2, 4.8, OUTLINE, { strokeWidth: 0 }),
      oval(107, 100, 3.2, 4.8, OUTLINE, { strokeWidth: 0 }),
      blob("M80 104 C76 96 72 92 70 86 C78 92 82 96 84 102 Z", "#FFF4D6"),
      blob("M120 104 C124 96 128 92 130 86 C122 92 118 96 116 102 Z", "#FFF4D6"),
      smile(100, 116, 7),
    ],
  },
  eyes(84, 116, 76, 0.75),
];

const hamster: PetArt = [
  groundShadow(62),
  feet("#F4A3A8"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      oval(100, 136, 64, 52, "#F2A64A"),
      oval(100, 148, 44, 36, "#FCE6C2", { strokeWidth: 0 }),
    ],
  },
  {
    part: "arms",
    origin: [100, 132],
    shapes: [
      oval(100, 128, 10, 18, "#3E2C20", { rotate: 10 }),
      oval(100, 128, 3, 12, "#F5E9D3", { strokeWidth: 0, rotate: 10 }),
      oval(86, 134, 9, 8, "#F4A3A8"),
      oval(114, 134, 9, 8, "#F4A3A8"),
    ],
  },
  {
    part: "ears",
    origin: [100, 36],
    shapes: [
      oval(66, 38, 12, 12, "#F2A64A"),
      oval(66, 38, 6, 6, "#F4A3A8", { strokeWidth: 0 }),
      oval(134, 38, 12, 12, "#F2A64A"),
      oval(134, 38, 6, 6, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 76, 46, 40, "#F2A64A"),
      oval(74, 94, 20, 15, "#FCE6C2", { strokeWidth: 0 }),
      oval(126, 94, 20, 15, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 96, 14, 10, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 89, 4.5, 3.2, "#E77C8C", { strokeWidth: 0 }),
      line("M93 97 Q97 102 100 97 Q103 102 107 97"),
      ...cheeks(70, 130, 88),
    ],
  },
  eyes(84, 116, 74, 0.8),
];

const penguin: PetArt = [
  groundShadow(54),
  feet("#F5A33A"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      oval(100, 126, 48, 62, "#2C3340"),
      oval(100, 136, 34, 50, "#FFFFFF", { strokeWidth: 0 }),
      oval(100, 96, 24, 10, "#F7C948", { strokeWidth: 0, opacity: 0.9 }),
    ],
  },
  {
    part: "arms",
    origin: [100, 120],
    shapes: [
      oval(54, 132, 10, 30, "#2C3340", { rotate: 15 }),
      oval(146, 132, 10, 30, "#2C3340", { rotate: -15 }),
    ],
  },
  {
    part: "head",
    origin: [100, 100],
    shapes: [
      oval(100, 60, 34, 32, "#2C3340"),
      oval(84, 58, 9, 6, "#F7C948", { strokeWidth: 0, rotate: -20 }),
      oval(116, 58, 9, 6, "#F7C948", { strokeWidth: 0, rotate: 20 }),
      blob("M88 70 L116 70 L100 84 Z", "#F5A33A"),
    ],
  },
  eyes(88, 112, 56, 0.6, true),
];

const panda: PetArt = [
  groundShadow(64),
  {
    part: "feet",
    origin: [100, 184],
    shapes: [oval(64, 178, 20, 13, "#24242C"), oval(136, 178, 20, 13, "#24242C")],
  },
  body("#FAFAF5", "#FFFFFF"),
  {
    part: "arms",
    origin: [100, 130],
    shapes: [
      line("M76 150 L124 74", "#4E9A2E", 8),
      line("M92 124 L98 128 M110 96 L116 100", "#2F6B1C", 3),
      blob("M120 80 C134 66 150 68 154 72 C146 80 132 86 120 80 Z", "#6CBF45"),
      blob("M114 90 C104 74 106 62 110 58 C116 70 118 80 114 90 Z", "#6CBF45"),
      oval(72, 138, 14, 20, "#24242C", { rotate: 35 }),
      oval(124, 112, 14, 20, "#24242C", { rotate: -30 }),
    ],
  },
  {
    part: "ears",
    origin: [100, 38],
    shapes: [oval(66, 40, 13, 13, "#24242C"), oval(134, 40, 13, 13, "#24242C")],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 76, 44, 40, "#FAFAF5"),
      oval(83, 80, 12, 15, "#24242C", { strokeWidth: 0, rotate: 25 }),
      oval(117, 80, 12, 15, "#24242C", { strokeWidth: 0, rotate: -25 }),
      oval(100, 94, 6, 4.5, OUTLINE, { strokeWidth: 0 }),
      smile(100, 104, 6),
      ...cheeks(72, 128, 98),
    ],
  },
  eyes(84, 116, 79, 0.65, true),
];

const hippo: PetArt = [
  {
    part: "shadow",
    origin: [100, 188],
    shapes: [oval(100, 188, 70, 9, "#000000", { strokeWidth: 0, opacity: 0.12 })],
  },
  feet("#7E77A0"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      oval(100, 138, 66, 50, "#9C95BC"),
      oval(100, 150, 44, 32, "#BDB6D8", { strokeWidth: 0 }),
    ],
  },
  arms("#9C95BC"),
  {
    part: "ears",
    origin: [100, 34],
    shapes: [
      oval(70, 36, 9, 7, "#9C95BC"),
      oval(70, 36, 4.5, 3.5, "#F4A3A8", { strokeWidth: 0 }),
      oval(130, 36, 9, 7, "#9C95BC"),
      oval(130, 36, 4.5, 3.5, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 68, 40, 32, "#9C95BC"),
      oval(100, 96, 46, 26, "#B6AFD3"),
      oval(86, 88, 5, 4, "#4B4566", { strokeWidth: 0 }),
      oval(114, 88, 5, 4, "#4B4566", { strokeWidth: 0 }),
      line("M64 102 Q100 118 136 102"),
      ...cheeks(62, 138, 92),
    ],
  },
  eyes(86, 114, 64, 0.65),
];

export const adultArt: Record<PetSpecies, PetArt> = {
  hedgehog,
  pig,
  hamster,
  penguin,
  panda,
  hippo,
};
