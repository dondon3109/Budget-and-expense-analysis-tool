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

// Juveniles keep the big eyes but stand taller: the head shrinks and the body grows.

const feet = (fill: string, spread = 22): PetLayer => ({
  part: "feet",
  origin: [100, 184],
  shapes: [oval(100 - spread, 184, 14, 7, fill), oval(100 + spread, 184, 14, 7, fill)],
});

const body = (fill: string, belly: string): PetLayer => ({
  part: "body",
  origin: [100, 182],
  shapes: [oval(100, 146, 46, 38, fill), oval(100, 154, 30, 25, belly, { strokeWidth: 0 })],
});

const arms = (fill: string, wave = false): PetLayer => ({
  part: "arms",
  origin: [100, 144],
  shapes: [
    oval(58, 146, 11, 17, fill, { rotate: 30 }),
    wave
      ? oval(146, 118, 11, 17, fill, { rotate: 30 })
      : oval(142, 146, 11, 17, fill, { rotate: -30 }),
  ],
});

const hedgehog: PetArt = [
  groundShadow(52),
  feet("#5C3B22"),
  {
    part: "body",
    origin: [100, 182],
    shapes: [
      blob(spikes(100, 146, 40, 58, 11, 150, 390), "#6B4527"),
      oval(100, 146, 46, 38, "#7A4E2D"),
      oval(100, 154, 30, 25, "#F3DCB4", { strokeWidth: 0 }),
    ],
  },
  arms("#F3DCB4"),
  {
    part: "ears",
    origin: [100, 50],
    shapes: [oval(66, 52, 10, 10, "#F3DCB4"), oval(134, 52, 10, 10, "#F3DCB4")],
  },
  {
    part: "head",
    origin: [100, 130],
    shapes: [
      blob(spikes(100, 84, 42, 62, 13, 155, 385), "#6B4527"),
      oval(100, 86, 46, 44, "#7A4E2D"),
      oval(100, 98, 36, 28, "#F3DCB4", { strokeWidth: 0 }),
      oval(100, 101, 7, 5, OUTLINE, { strokeWidth: 0 }),
      dot(102, 99, 1.8, "#FFFFFF"),
      smile(100, 112, 6),
      ...cheeks(74, 126, 104),
    ],
  },
  eyes(82, 118, 88, 0.9),
];

const pig: PetArt = [
  groundShadow(52),
  feet("#E8899E"),
  {
    part: "tail",
    origin: [144, 152],
    shapes: [line("M144 152 c14 0 20 -14 11 -18 c-8 -3 -9 9 0 9", "#E07A94", 4)],
  },
  body("#F7B3C2", "#FBD0DA"),
  arms("#F7B3C2", true),
  {
    part: "ears",
    origin: [100, 44],
    shapes: [
      blob("M64 52 L56 22 L88 38 Z", "#F7B3C2"),
      { kind: "path", d: "M66 47 L62 31 L80 40 Z", fill: "#EE8FA6" },
      blob("M136 52 L144 22 L112 38 Z", "#F7B3C2"),
      { kind: "path", d: "M134 47 L138 31 L120 40 Z", fill: "#EE8FA6" },
    ],
  },
  {
    part: "head",
    origin: [100, 130],
    shapes: [
      oval(100, 84, 48, 44, "#F7B3C2"),
      oval(100, 102, 17, 11, "#F08FA7"),
      oval(94, 102, 3, 4.5, OUTLINE, { strokeWidth: 0 }),
      oval(106, 102, 3, 4.5, OUTLINE, { strokeWidth: 0 }),
      blob("M86 116 Q100 132 114 116 Z", "#C2475F"),
      ...cheeks(70, 130, 100),
    ],
  },
  // A big laugh: happy closed eyes.
  {
    part: "eyes",
    origin: [100, 82],
    shapes: [line("M74 84 Q82 74 90 84", OUTLINE, 4), line("M110 84 Q118 74 126 84", OUTLINE, 4)],
  },
];

const hamster: PetArt = [
  groundShadow(52),
  feet("#F4A3A8"),
  body("#F2A64A", "#FCE6C2"),
  {
    part: "arms",
    origin: [100, 140],
    shapes: [oval(84, 140, 8, 7, "#F4A3A8"), oval(116, 140, 8, 7, "#F4A3A8")],
  },
  {
    part: "ears",
    origin: [100, 46],
    shapes: [
      oval(64, 46, 13, 13, "#F2A64A"),
      oval(64, 46, 7, 7, "#F4A3A8", { strokeWidth: 0 }),
      oval(136, 46, 13, 13, "#F2A64A"),
      oval(136, 46, 7, 7, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 130],
    shapes: [
      oval(100, 84, 50, 44, "#F2A64A"),
      oval(74, 104, 20, 15, "#FCE6C2", { strokeWidth: 0 }),
      oval(126, 104, 20, 15, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 106, 15, 11, "#FCE6C2", { strokeWidth: 0 }),
      oval(100, 98, 4.5, 3.2, "#E77C8C", { strokeWidth: 0 }),
      blob("M93 106 Q100 118 107 106 Z", "#C2475F"),
      ...cheeks(72, 128, 98),
    ],
  },
  eyes(82, 118, 82, 0.9),
];

const penguin: PetArt = [
  groundShadow(48),
  feet("#F5A33A", 18),
  {
    part: "body",
    origin: [100, 182],
    shapes: [
      oval(100, 140, 42, 46, "#2C3340"),
      oval(100, 148, 30, 36, "#FFFFFF", { strokeWidth: 0 }),
    ],
  },
  {
    part: "arms",
    origin: [100, 130],
    shapes: [
      oval(60, 140, 9, 24, "#2C3340", { rotate: 20 }),
      oval(140, 140, 9, 24, "#2C3340", { rotate: -20 }),
    ],
  },
  {
    part: "head",
    origin: [100, 120],
    shapes: [
      oval(100, 78, 42, 40, "#2C3340"),
      {
        kind: "path",
        d: "M100 66 C110 54 134 60 132 82 C130 100 116 110 100 110 C84 110 70 100 68 82 C66 60 90 54 100 66 Z",
        fill: "#FFFFFF",
      },
      blob("M90 92 L110 92 L100 104 Z", "#F5A33A"),
      ...cheeks(76, 124, 96),
    ],
  },
  eyes(86, 114, 80, 0.8),
];

const panda: PetArt = [
  groundShadow(52),
  feet("#24242C"),
  body("#FAFAF5", "#FFFFFF"),
  {
    part: "arms",
    origin: [100, 140],
    shapes: [
      oval(58, 146, 12, 17, "#24242C", { rotate: 30 }),
      line("M150 66 L150 170", "#4E9A2E", 7),
      line("M146 96 L154 96 M146 132 L154 132", "#2F6B1C", 3),
      blob("M150 74 C162 60 176 62 180 66 C172 74 160 80 150 74 Z", "#6CBF45"),
      oval(146, 128, 12, 17, "#24242C", { rotate: -10 }),
    ],
  },
  {
    part: "ears",
    origin: [100, 42],
    shapes: [oval(62, 42, 14, 14, "#24242C"), oval(138, 42, 14, 14, "#24242C")],
  },
  {
    part: "head",
    origin: [100, 130],
    shapes: [
      oval(100, 84, 48, 44, "#FAFAF5"),
      oval(81, 88, 13, 17, "#24242C", { strokeWidth: 0, rotate: 25 }),
      oval(119, 88, 13, 17, "#24242C", { strokeWidth: 0, rotate: -25 }),
      oval(100, 104, 6.5, 4.5, OUTLINE, { strokeWidth: 0 }),
      blob("M92 112 Q100 122 108 112 Z", "#C2475F"),
      ...cheeks(70, 130, 108),
    ],
  },
  eyes(82, 118, 87, 0.75, true),
];

const hippo: PetArt = [
  {
    part: "shadow",
    origin: [100, 188],
    shapes: [
      blob(
        "M36 186 C40 174 62 176 70 180 C84 170 118 172 132 180 C146 174 166 176 166 188 C140 196 60 196 36 186 Z",
        "#7A5A3C",
      ),
      dot(58, 182, 3, "#5C4128"),
      dot(146, 184, 4, "#5C4128"),
    ],
  },
  feet("#8F88B0"),
  {
    part: "body",
    origin: [100, 182],
    shapes: [
      oval(100, 144, 50, 40, "#A9A3C6"),
      oval(100, 154, 32, 24, "#C9C3E0", { strokeWidth: 0 }),
      blob("M60 160 C70 150 84 158 80 168 C76 176 62 174 60 160 Z", "#7A5A3C"),
      dot(124, 132, 6, "#7A5A3C"),
    ],
  },
  arms("#A9A3C6"),
  {
    part: "ears",
    origin: [100, 42],
    shapes: [
      oval(66, 42, 9, 7, "#A9A3C6"),
      oval(66, 42, 4.5, 3.5, "#F4A3A8", { strokeWidth: 0 }),
      oval(134, 42, 9, 7, "#A9A3C6"),
      oval(134, 42, 4.5, 3.5, "#F4A3A8", { strokeWidth: 0 }),
    ],
  },
  {
    part: "head",
    origin: [100, 130],
    shapes: [
      oval(100, 80, 46, 40, "#A9A3C6"),
      oval(100, 106, 38, 22, "#C3BDDD"),
      oval(89, 101, 4, 3, "#4B4566", { strokeWidth: 0 }),
      oval(111, 101, 4, 3, "#4B4566", { strokeWidth: 0 }),
      smile(100, 113, 9),
      dot(76, 66, 5, "#7A5A3C"),
      ...cheeks(68, 132, 94),
    ],
  },
  eyes(84, 116, 74, 0.85),
];

export const juvenileArt: Record<PetSpecies, PetArt> = {
  hedgehog,
  pig,
  hamster,
  penguin,
  panda,
  hippo,
};
