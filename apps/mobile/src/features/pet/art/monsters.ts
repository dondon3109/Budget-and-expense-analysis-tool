import type { PetSpecies } from "@zoption/shared";

import {
  angryEyes,
  aura,
  blob,
  line,
  OUTLINE,
  oval,
  snarl,
  spikes,
  type PetArt,
  type PetLayer,
  type PetShape,
} from "./shapes";

// Monsters are the only aggressive stage: hulking, armored, glaring, with a colored aura.

const claws = (x: number, y: number, flip = 1): PetShape[] =>
  [-6, 0, 6].map((dx) => blob(`M${x + dx - 3} ${y} l${3 * flip} 8 l3 -8 Z`, "#FFF4D6"));

const feet = (fill: string): PetLayer => ({
  part: "feet",
  origin: [100, 184],
  shapes: [
    oval(70, 182, 19, 9, fill),
    oval(130, 182, 19, 9, fill),
    ...claws(70, 186),
    ...claws(130, 186),
  ],
});

const fists = (fill: string): PetLayer => ({
  part: "arms",
  origin: [100, 140],
  shapes: [
    oval(44, 140, 16, 26, fill, { rotate: 20 }),
    oval(156, 140, 16, 26, fill, { rotate: -20 }),
    ...claws(40, 162),
    ...claws(160, 162),
  ],
});

const horns = (fill: string): PetShape[] => [
  blob("M70 52 C56 40 52 22 60 10 C64 26 74 36 84 42 Z", fill),
  blob("M130 52 C144 40 148 22 140 10 C136 26 126 36 116 42 Z", fill),
];

const hedgehog: PetArt = [
  aura("#B24BF3"),
  feet("#2E2629"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      blob(spikes(100, 134, 52, 88, 17, 130, 410), "#2E2629"),
      blob(spikes(100, 134, 46, 70, 15, 140, 400), "#4A3E42"),
      oval(100, 140, 58, 46, "#4A3E42"),
      oval(100, 150, 36, 28, "#8C7A6B", { strokeWidth: 0 }),
    ],
  },
  fists("#4A3E42"),
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      ...horns("#C9B79C"),
      oval(100, 78, 40, 36, "#4A3E42"),
      blob("M84 92 C90 80 110 80 116 92 C112 106 88 106 84 92 Z", "#8C7A6B"),
      oval(100, 90, 7, 5, OUTLINE, { strokeWidth: 0 }),
      ...snarl(100, 104, 16),
    ],
  },
  angryEyes(84, 116, 74),
];

const pig: PetArt = [
  aura("#FF4D4D"),
  feet("#2F201C"),
  body("#4A3530", "#6B4E46"),
  fists("#4A3530"),
  {
    part: "ears",
    origin: [100, 40],
    shapes: [
      blob("M66 50 L54 18 L88 38 Z", "#4A3530"),
      blob("M134 50 L146 18 L112 38 Z", "#4A3530"),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      blob(spikes(100, 70, 34, 60, 9, 200, 340), "#1F1513"),
      oval(100, 78, 44, 38, "#4A3530"),
      oval(100, 98, 22, 14, "#6B4E46"),
      oval(92, 98, 3.4, 5, OUTLINE, { strokeWidth: 0 }),
      oval(108, 98, 3.4, 5, OUTLINE, { strokeWidth: 0 }),
      blob("M74 110 C66 96 62 86 64 72 C72 88 78 96 84 106 Z", "#FFF4D6"),
      blob("M126 110 C134 96 138 86 136 72 C128 88 122 96 116 106 Z", "#FFF4D6"),
      ...snarl(100, 114, 14),
    ],
  },
  angryEyes(84, 116, 72),
];

const hamster: PetArt = [
  aura("#3DB8FF"),
  feet("#5B6675"),
  body("#D9822F", "#F2C48E"),
  {
    part: "arms",
    origin: [100, 140],
    shapes: [
      oval(44, 140, 16, 26, "#D9822F", { rotate: 20 }),
      oval(156, 140, 16, 26, "#D9822F", { rotate: -20 }),
      blob("M28 112 C34 96 60 94 66 110 C56 116 38 118 28 112 Z", "#6F7C8C"),
      blob("M172 112 C166 96 140 94 134 110 C144 116 162 118 172 112 Z", "#6F7C8C"),
      ...claws(40, 162),
      ...claws(160, 162),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      ...horns("#6F7C8C"),
      oval(100, 78, 44, 38, "#D9822F"),
      blob("M58 62 C70 40 130 40 142 62 C128 56 72 56 58 62 Z", "#6F7C8C"),
      oval(74, 96, 18, 13, "#F2C48E", { strokeWidth: 0 }),
      oval(126, 96, 18, 13, "#F2C48E", { strokeWidth: 0 }),
      oval(100, 88, 5, 3.5, "#E77C8C", { strokeWidth: 0 }),
      ...snarl(100, 102, 18),
    ],
  },
  angryEyes(82, 118, 74, "#3DB8FF"),
];

const penguin: PetArt = [
  aura("#7FE0FF"),
  feet("#E08A1E"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      oval(100, 128, 54, 62, "#1F2530"),
      oval(100, 138, 36, 48, "#E8F6FC", { strokeWidth: 0 }),
      blob("M60 100 L48 70 L72 88 L76 58 L88 92 Z", "#9FE3F9"),
      blob("M140 100 L152 70 L128 88 L124 58 L112 92 Z", "#9FE3F9"),
    ],
  },
  {
    part: "arms",
    origin: [100, 120],
    shapes: [
      blob("M52 104 L22 150 L44 144 L30 176 L66 136 Z", "#9FE3F9"),
      blob("M148 104 L178 150 L156 144 L170 176 L134 136 Z", "#9FE3F9"),
    ],
  },
  {
    part: "head",
    origin: [100, 100],
    shapes: [
      blob(spikes(100, 60, 30, 52, 7, 200, 340), "#BDEEFC"),
      oval(100, 62, 36, 32, "#1F2530"),
      blob("M84 74 L116 74 L100 90 Z", "#F5A33A"),
      ...snarl(100, 80, 10).slice(1),
    ],
  },
  angryEyes(86, 114, 58, "#3DE0FF"),
];

const panda: PetArt = [
  aura("#FF6A1A"),
  feet("#1A1A20"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      oval(100, 140, 62, 48, "#F2EFE8"),
      oval(100, 150, 40, 30, "#FFFFFF", { strokeWidth: 0 }),
      line("M76 128 l10 10 M118 132 l8 -10 M98 160 l4 8", "#E53935", 4),
    ],
  },
  fists("#1A1A20"),
  {
    part: "ears",
    origin: [100, 36],
    shapes: [oval(64, 38, 14, 14, "#1A1A20"), oval(136, 38, 14, 14, "#1A1A20")],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 76, 46, 40, "#F2EFE8"),
      blob("M66 68 C74 58 92 66 94 80 C90 92 70 90 66 68 Z", "#1A1A20"),
      blob("M134 68 C126 58 108 66 106 80 C110 92 130 90 134 68 Z", "#1A1A20"),
      line("M60 86 l12 4 M140 86 l-12 4", "#E53935", 4),
      oval(100, 92, 6, 4.5, OUTLINE, { strokeWidth: 0 }),
      ...snarl(100, 104, 16),
    ],
  },
  angryEyes(84, 116, 76),
];

const hippo: PetArt = [
  aura("#FF4D4D"),
  feet("#4D4760"),
  {
    part: "body",
    origin: [100, 184],
    shapes: [
      blob(spikes(100, 136, 56, 76, 9, 190, 350), "#7A6E58"),
      oval(100, 138, 66, 50, "#6E6788"),
      blob("M48 120 C60 100 140 100 152 120 C150 136 50 136 48 120 Z", "#5B5040"),
      oval(100, 152, 40, 28, "#8E87A8", { strokeWidth: 0 }),
    ],
  },
  fists("#6E6788"),
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      ...horns("#C9B79C"),
      oval(100, 68, 40, 32, "#6E6788"),
      oval(100, 98, 48, 28, "#8E87A8"),
      oval(84, 88, 5, 4, "#2B2738", { strokeWidth: 0 }),
      oval(116, 88, 5, 4, "#2B2738", { strokeWidth: 0 }),
      ...snarl(100, 106, 26),
    ],
  },
  angryEyes(84, 116, 62),
];

export const monsterArt: Record<PetSpecies, PetArt> = {
  hedgehog,
  pig,
  hamster,
  penguin,
  panda,
  hippo,
};

function body(fill: string, belly: string): PetLayer {
  return {
    part: "body",
    origin: [100, 184],
    shapes: [oval(100, 140, 62, 48, fill), oval(100, 150, 40, 30, belly, { strokeWidth: 0 })],
  };
}
