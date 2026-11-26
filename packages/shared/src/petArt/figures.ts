import type { PetColor, PetSpecies } from "../pet";
import type { PetHatchedStage } from "../petReaction";

import { tintPetHex } from "./colors";
import type { PetGradient, PetLayer, PetShape } from "./shapes";

// Hatched pets are soft vinyl-toy figures drawn from shape data, the same drawing on the web and
// the phone. Every rounded part is filled with a radial gradient lit from the upper left (a bright
// spot, the base tone, a shaded edge, and a faint bounce light at the rim), with a glossy
// highlight on the head and body and a soft contact shadow on the ground. The figure is built
// from one chibi template: the stage sets the proportions, the species adds its ears, snout,
// or muzzle, and a Legend wears its own golden outfit.

/** How a hatched pet looks: healthy, or sick (half-lidded, pale, sweating), or fading (washed out). */
export type PetFigureHealth = "healthy" | "sick" | "fading";

/**
 * A pet figure in parts, so each platform can animate them: the ground shadow stays put while the
 * body bounces, and a healthy pet blinks by swapping `eyes` for `blink`.
 */
export interface PetFigure {
  shadow: PetLayer;
  body: PetLayer[];
  eyes: PetLayer;
  /** Closed eyes for a healthy pet's blink; sick and fading pets never blink. */
  blink: PetLayer | null;
}

// ---- Color helpers -------------------------------------------------------------------------

const channels = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** `a` moved toward `b` by `t` (0 to 1), as `#RRGGBB`. */
function mix(a: string, b: string, t: number): string {
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((value, index) =>
      Math.round(value + (to[index]! - value) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const lighten = (color: string, t: number) => mix(color, "#FFFFFF", t);
// Shade toward a warm deep plum rather than black, so shadows stay soft like painted vinyl.
const darken = (color: string, t: number) => mix(color, "#2A1626", t);

/** The rounded-figure shading for a part of `base` color. */
function soft(base: string, glow = 0.32, shade = 0.24): PetGradient {
  return {
    cx: 0.46,
    cy: 0.38,
    r: 0.7,
    fx: 0.38,
    fy: 0.26,
    stops: [
      { offset: 0, color: lighten(base, glow) },
      { offset: 0.5, color: base },
      { offset: 0.9, color: darken(base, shade) },
      { offset: 1, color: darken(base, shade * 0.6) },
    ],
  };
}

/** Soft contact shading where one part rests on another, such as under the chin. */
const occlusion: PetGradient = {
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
  stops: [
    { offset: 0, color: "#2A1626", opacity: 0.22 },
    { offset: 1, color: "#2A1626", opacity: 0 },
  ],
};

/** A soft white glint that fades out at its edge. */
const glint = (opacity: number): PetGradient => ({
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
  stops: [
    { offset: 0, color: "#FFFFFF", opacity },
    { offset: 1, color: "#FFFFFF", opacity: 0 },
  ],
});

const blush: PetGradient = {
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
  stops: [
    { offset: 0, color: "#FF7E9A", opacity: 0.38 },
    { offset: 1, color: "#FF7E9A", opacity: 0 },
  ],
};

// ---- Shape helpers -------------------------------------------------------------------------

const r1 = (value: number) => Math.round(value * 10) / 10;

const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string | PetGradient,
  rotate?: number,
  opacity?: number,
): PetShape => ({
  kind: "ellipse",
  cx: r1(cx),
  cy: r1(cy),
  rx: r1(rx),
  ry: r1(ry),
  fill,
  rotate,
  opacity,
});

const circle = (cx: number, cy: number, r: number, fill: string | PetGradient): PetShape => ({
  kind: "circle",
  cx: r1(cx),
  cy: r1(cy),
  r: r1(r),
  fill,
});

const solid = (d: string, fill: string | PetGradient, opacity?: number): PetShape => ({
  kind: "path",
  d,
  fill,
  opacity,
});

const stroke = (d: string, color: string, width: number, opacity?: number): PetShape => ({
  kind: "path",
  d,
  stroke: color,
  strokeWidth: width,
  opacity,
});

/** `M x y` style coordinates rounded for compact paths. */
const pt = (x: number, y: number) => `${r1(x)} ${r1(y)}`;

// ---- Palettes ------------------------------------------------------------------------------

interface Palette {
  /** Skin: the part a pet color tints. */
  body: string;
  /** Belly, snout, or muzzle. */
  light: string;
  /** Inner ears and paw pads. */
  inner: string;
  /** Nostrils. */
  dark: string;
}

const INK = "#24161A";

function palette(species: PetSpecies, color: PetColor): Palette {
  switch (species) {
    case "pig": {
      const body = tintPetHex("#F2A4B4", color);
      return {
        body,
        light: lighten(body, 0.38),
        inner: darken(body, 0.12),
        dark: darken(body, 0.45),
      };
    }
    case "hippo": {
      const body = tintPetHex("#A9A1CB", color);
      return {
        body,
        light: lighten(body, 0.3),
        inner: "#EAA8C0",
        dark: darken(body, 0.5),
      };
    }
  }
}

/** A sick pet goes pale and a little green; a fading one washes out toward grey. */
function washed(colors: Palette, health: PetFigureHealth): Palette {
  if (health === "healthy") return colors;
  const [toward, t] = health === "sick" ? ["#C9DCC2", 0.32] : ["#DCDCE2", 0.52];
  const wash = (value: string) => mix(value, toward, t);
  return {
    body: wash(colors.body),
    light: wash(colors.light),
    inner: wash(colors.inner),
    dark: wash(colors.dark),
  };
}

// ---- Proportions ---------------------------------------------------------------------------

interface Build {
  /** Figure scale around the feet. */
  scale: number;
  headY: number;
  headR: number;
  bodyY: number;
  bodyRx: number;
  bodyRy: number;
  /** A baby sits with its feet forward; older stages stand. */
  sits: boolean;
  /** Eye size. */
  eye: number;
}

// A big round head on a tiny body, like a desk toy: the head is most of the figure at every
// stage, and the eyes shrink a little as the pet grows.
const builds: Record<PetHatchedStage, Build> = {
  baby: {
    scale: 0.82,
    headY: 94,
    headR: 64,
    bodyY: 158,
    bodyRx: 44,
    bodyRy: 28,
    sits: true,
    eye: 1.75,
  },
  juvenile: {
    scale: 0.9,
    headY: 86,
    headR: 59,
    bodyY: 152,
    bodyRx: 44,
    bodyRy: 34,
    sits: false,
    eye: 1.62,
  },
  adult: {
    scale: 1,
    headY: 82,
    headR: 56,
    bodyY: 148,
    bodyRx: 46,
    bodyRy: 38,
    sits: false,
    eye: 1.5,
  },
  legend: {
    scale: 1,
    headY: 88,
    headR: 54,
    bodyY: 150,
    bodyRx: 46,
    bodyRy: 36,
    sits: false,
    eye: 1.44,
  },
};

const GROUND = 188;

// ---- Parts ---------------------------------------------------------------------------------

function ears(species: PetSpecies, b: Build, c: Palette): PetShape[] {
  const { headY: y, headR: r } = b;
  const at = (side: -1 | 1, angle: number, lift = 1) => ({
    x: 100 + side * Math.cos(angle) * r * lift,
    y: y - Math.sin(angle) * r * lift,
  });
  switch (species) {
    case "hippo":
      // Small round ears with a pink inside, high on the head.
      return ([-1, 1] as const).flatMap((side) => {
        const p = at(side, 1.12, 0.92);
        const size = r * 0.17;
        return [
          circle(p.x, p.y, size, soft(c.body)),
          circle(p.x + side * 1, p.y + 1.5, size * 0.55, soft(c.inner, 0.2, 0.15)),
        ];
      });
    case "pig":
      // Soft floppy ears that tip out and down beside the head.
      return ([-1, 1] as const).map((side) =>
        ellipse(
          100 + side * r * 0.86,
          y - r * 0.52,
          r * 0.2,
          r * 0.34,
          soft(c.body, 0.3, 0.3),
          side * -48,
        ),
      );
  }
}

function legs(b: Build, c: Palette): PetShape[] {
  return ([-1, 1] as const).flatMap((side) => {
    // Short stumps that grow out of the bottom of the body, like a desk toy's.
    const x = 100 + side * b.bodyRx * 0.42;
    const top = b.bodyY + b.bodyRy * (b.sits ? 0.2 : 0.05);
    const ry = (GROUND - top) / 2 + 1;
    return [ellipse(x, top + ry, 14, ry, soft(c.body, 0.3, 0.26))];
  });
}

/** Small side nubs: the arms a Legend holds its prize in. */
function arms(b: Build, c: Palette, legend: boolean): PetShape[] {
  if (!legend) return [];
  return ([-1, 1] as const).map((side) =>
    ellipse(
      100 + side * b.bodyRx * 0.92,
      b.bodyY - b.bodyRy * 0.15,
      9,
      12,
      soft(c.body),
      side * 22,
    ),
  );
}

/** Belly or chest: a lighter oval on the front of the body. */
function belly(b: Build, c: Palette): PetShape[] {
  return [
    ellipse(
      100,
      b.bodyY + b.bodyRy * 0.12,
      b.bodyRx * 0.66,
      b.bodyRy * 0.78,
      soft(c.light, 0.5, 0.16),
    ),
  ];
}

/** The face markings and snout, drawn on the head below the eyes. */
function face(species: PetSpecies, b: Build, c: Palette): PetShape[] {
  const { headY: y, headR: r } = b;
  switch (species) {
    case "pig":
      return [
        ellipse(100, y + r * 0.32, r * 0.36, r * 0.25, soft(c.light, 0.4, 0.2)),
        ellipse(100 - r * 0.12, y + r * 0.32, r * 0.06, r * 0.1, c.dark),
        ellipse(100 + r * 0.12, y + r * 0.32, r * 0.06, r * 0.1, c.dark),
      ];
    case "hippo":
      return [
        ellipse(100, y + r * 0.4, r * 0.8, r * 0.5, soft(c.light, 0.42, 0.2)),
        ellipse(100 - r * 0.26, y + r * 0.22, r * 0.07, r * 0.1, c.dark, -12),
        ellipse(100 + r * 0.26, y + r * 0.22, r * 0.07, r * 0.1, c.dark, 12),
      ];
  }
}

function eyeHeight(species: PetSpecies, b: Build): number {
  return b.headY - b.headR * (species === "hippo" ? 0.14 : 0.06);
}

function mouthAt(species: PetSpecies, b: Build): number {
  return b.headY + b.headR * (species === "hippo" ? 0.6 : 0.62);
}

function mouth(species: PetSpecies, b: Build, health: PetFigureHealth): PetShape[] {
  const y = mouthAt(species, b);
  if (health === "sick") return [stroke(`M${pt(100 - 7, y + 1)} q3.5 -3 7 0 q3.5 3 7 0`, INK, 2.2)];
  if (health === "fading") return [stroke(`M${pt(100 - 4, y + 1)} L${pt(100 + 4, y + 1)}`, INK, 2)];
  const w = species === "hippo" ? 9 : 7;
  return [
    stroke(
      `M${pt(100 - w, y)} Q${pt(100 - w / 2, y + 5)} ${pt(100, y + 0.5)} Q${pt(100 + w / 2, y + 5)} ${pt(100 + w, y)}`,
      INK,
      2.2,
    ),
  ];
}

function cheeks(species: PetSpecies, b: Build): PetShape[] {
  const y = eyeHeight(species, b) + b.headR * 0.32;
  const dx = b.headR * (species === "hippo" ? 0.66 : 0.58);
  return [ellipse(100 - dx, y, 9, 6, blush), ellipse(100 + dx, y, 9, 6, blush)];
}

/** The glossy highlights that sell the vinyl: a soft streak on the head and the belly. */
function gloss(b: Build): PetShape[] {
  return [
    ellipse(
      100 - b.headR * 0.4,
      b.headY - b.headR * 0.5,
      b.headR * 0.3,
      b.headR * 0.14,
      glint(0.4),
      -32,
    ),
    ellipse(
      100 - b.bodyRx * 0.48,
      b.bodyY - b.bodyRy * 0.3,
      b.bodyRx * 0.16,
      b.bodyRy * 0.1,
      glint(0.25),
      -38,
    ),
  ];
}

// ---- Eyes ----------------------------------------------------------------------------------

// Glassy eyes: dark at the top, glowing warm brown low down where light passes through.
const eyeBall: PetGradient = {
  cx: 0.5,
  cy: 0.72,
  r: 0.7,
  fx: 0.5,
  fy: 0.8,
  stops: [
    { offset: 0, color: "#6A4530" },
    { offset: 0.5, color: "#2A1810" },
    { offset: 1, color: "#0C0705" },
  ],
};

function eyes(species: PetSpecies, b: Build, health: PetFigureHealth, closed: boolean): PetLayer {
  const s = b.eye;
  const y = eyeHeight(species, b);
  const dx = b.headR * 0.42;
  const lid = INK;
  const shapes = ([-1, 1] as const).flatMap((side): PetShape[] => {
    const x = 100 + side * dx;
    if (closed)
      return [
        stroke(`M${pt(x - 6.5 * s, y)} Q${pt(x, y + 5.5 * s)} ${pt(x + 6.5 * s, y)}`, lid, 3),
      ];
    if (health === "fading")
      return [stroke(`M${pt(x - 6 * s, y + 2)} L${pt(x + 6 * s, y + 2 + side * 1.2)}`, lid, 2.6)];
    if (health === "sick") {
      const rx = 6.2 * s;
      const ry = 6.6 * s;
      // Half-closed: only the lower half of the eye shows under a droopy lid.
      return [
        solid(`M${pt(x - rx, y)} A${pt(rx, ry)} 0 0 0 ${pt(x + rx, y)} Z`, eyeBall),
        circle(x - 2 * s, y + 2.2 * s, 1.4 * s, "#FFFFFF"),
        stroke(
          `M${pt(x - rx - 1.5, y - side * 2.5)} L${pt(x + rx + 1.5, y + side * 0.5)}`,
          lid,
          2.6,
        ),
      ];
    }
    const rx = 7 * s;
    const ry = 8.6 * s;
    return [
      ellipse(x, y, rx, ry, eyeBall),
      // A big soft window reflection up and to the left, a small glint below, and a faint
      // rim of light along the bottom of the glass.
      ellipse(x - rx * 0.3, y - ry * 0.36, rx * 0.46, ry * 0.36, glint(1), -20),
      circle(x - rx * 0.32, y - ry * 0.38, rx * 0.24, "#FFFFFF"),
      circle(x + rx * 0.4, y + ry * 0.36, rx * 0.12, "#FFFFFF"),
      ellipse(x, y + ry * 0.62, rx * 0.62, ry * 0.2, glint(0.22)),
    ];
  });
  return { shapes };
}

// ---- Health extras -------------------------------------------------------------------------

/** A sweat drop and a thermometer for a sick pet. */
function sickExtras(species: PetSpecies, b: Build): PetShape[] {
  const x = 100 + b.headR * 0.78;
  const y = b.headY - b.headR * 0.46;
  const drop = `M${pt(x, y - 9)} Q${pt(x + 7, y + 1)} ${pt(x, y + 5)} Q${pt(x - 7, y + 1)} ${pt(x, y - 9)} Z`;
  const my = mouthAt(species, b);
  const from = { x: 100 + 6, y: my + 1 };
  const to = { x: 100 + 26, y: my - 7 };
  return [
    solid(drop, {
      cx: 0.4,
      cy: 0.55,
      r: 0.6,
      stops: [
        { offset: 0, color: "#E8F7FF" },
        { offset: 1, color: "#7CC4EC" },
      ],
    }),
    stroke(`M${pt(from.x, from.y)} L${pt(to.x, to.y)}`, "#F4F7FA", 4.2),
    stroke(`M${pt(from.x + 4, from.y - 1.6)} L${pt(to.x, to.y)}`, "#E0474C", 1.6),
    circle(to.x, to.y, 2.6, "#E0474C"),
  ];
}

// ---- Legend outfits ------------------------------------------------------------------------

const GOLD = "#EDB93E";
const goldFill = soft(GOLD, 0.55, 0.32);

interface Outfit {
  hat: "tophat" | "lotus";
  item: "coin" | "lotus";
  sash: string;
}

const outfits: Record<PetSpecies, Outfit> = {
  pig: { hat: "tophat", item: "coin", sash: "#7A3B8F" },
  hippo: { hat: "lotus", item: "lotus", sash: "#2A9D8F" },
};

function collar(b: Build, outfit: Outfit): PetShape[] {
  const d = `M${pt(100 - b.bodyRx * 0.85, b.bodyY - b.bodyRy * 0.55)} L${pt(100 - b.bodyRx * 0.62, b.bodyY - b.bodyRy * 0.78)} L${pt(100 + b.bodyRx * 0.9, b.bodyY + b.bodyRy * 0.55)} L${pt(100 + b.bodyRx * 0.66, b.bodyY + b.bodyRy * 0.76)} Z`;
  return [
    solid(d, soft(outfit.sash, 0.3, 0.3)),
    circle(100 - b.bodyRx * 0.6, b.bodyY - b.bodyRy * 0.6, 5, goldFill),
  ];
}

function hat(b: Build, kind: Outfit["hat"]): PetShape[] {
  const top = b.headY - b.headR * 0.9;
  switch (kind) {
    case "tophat": {
      const w = b.headR * 0.42;
      return [
        ellipse(100, top + 4, w * 1.55, 6, soft("#2E2A36", 0.3, 0.3)),
        solid(
          `M${pt(100 - w, top + 3)} L${pt(100 - w * 0.9, top - 30)} Q${pt(100, top - 35)} ${pt(100 + w * 0.9, top - 30)} L${pt(100 + w, top + 3)} Q${pt(100, top + 8)} ${pt(100 - w, top + 3)} Z`,
          soft("#3A3544", 0.35, 0.3),
        ),
        solid(
          `M${pt(100 - w * 0.97, top - 6)} L${pt(100 + w * 0.97, top - 6)} L${pt(100 + w, top + 1)} Q${pt(100, top + 5)} ${pt(100 - w, top + 1)} Z`,
          goldFill,
        ),
      ];
    }
    case "lotus":
      // A golden lotus: outer petals fanning out behind a tall middle one.
      return [-52, -26, 26, 52]
        .map((tilt) => ellipse(100 + tilt * 0.3, top - 4, 7.5, 13, goldFill, tilt))
        .concat([
          ellipse(100, top - 9, 7.5, 15, soft("#F6D46A", 0.55, 0.3)),
          circle(100, top - 1, 3, soft("#D8344A", 0.5, 0.3)),
        ]);
  }
}

function item(b: Build, kind: Outfit["item"]): PetShape[] {
  const x = 100 + b.bodyRx * 1.02;
  const y = b.bodyY - b.bodyRy * 0.12;
  switch (kind) {
    case "coin":
      return [
        circle(x + 2, y, 11, goldFill),
        stroke(`M${pt(x - 4, y)} a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0`, "#C08A1E", 1.8),
      ];
    case "lotus":
      return [
        ellipse(x + 2, y + 2, 5, 11, goldFill),
        ellipse(x - 5, y + 4, 5, 10, goldFill, -32),
        ellipse(x + 9, y + 4, 5, 10, goldFill, 32),
      ];
  }
}

// ---- Assembly ------------------------------------------------------------------------------

const stageTransform = (b: Build, health: PetFigureHealth) => {
  // A fading pet slumps a little lower and wider.
  const squash = health === "fading" ? " scale(1.04 0.92)" : "";
  if (b.scale === 1 && !squash) return undefined;
  return `translate(100 ${GROUND}) scale(${b.scale})${squash} translate(-100 -${GROUND})`;
};

/** The ground shadow under a figure, which stays on the floor while the pet bounces. */
function groundShadow(b: Build): PetLayer {
  return {
    shapes: [
      ellipse(100, GROUND + 2, 60 * b.scale, 9, {
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: "#2A1626", opacity: 0.32 },
          { offset: 0.6, color: "#2A1626", opacity: 0.14 },
          { offset: 1, color: "#2A1626", opacity: 0 },
        ],
      }),
    ],
  };
}

/**
 * A hatched pet as a soft vinyl figure in its pet color, for its stage and health. `color` null
 * (a pet from before colors existed) draws the original.
 */
export function petFigureArt(
  species: PetSpecies,
  stage: PetHatchedStage,
  health: PetFigureHealth,
  color: PetColor | null,
): PetFigure {
  const b = builds[stage];
  const c = washed(palette(species, color ?? "original"), health);
  const outfit = stage === "legend" ? outfits[species] : null;
  const transform = stageTransform(b, health);
  const headRx = b.headR * (species === "hippo" ? 1.1 : 1.04);
  const headRy = b.headR * 0.92;

  const back: PetShape[] = ears(species, b, c);

  const figure: PetShape[] = [
    ellipse(100, b.bodyY, b.bodyRx, b.bodyRy, soft(c.body)),
    ...belly(b, c),
    ...(outfit ? collar(b, outfit) : []),
    ...legs(b, c),
    ...arms(b, c, outfit !== null),
    ellipse(100, b.headY + headRy * 0.92, headRx * 0.7, 9, occlusion),
    ellipse(100, b.headY, headRx, headRy, soft(c.body, 0.36)),
    ...face(species, b, c),
    ...(health === "fading" ? [] : cheeks(species, b)),
    ...mouth(species, b, health),
  ];
  if (outfit) figure.push(...hat(b, outfit.hat), ...item(b, outfit.item));
  figure.push(...gloss(b));
  if (health === "sick") figure.push(...sickExtras(species, b));

  const placed = (layer: PetLayer): PetLayer => (transform ? { ...layer, transform } : layer);
  return {
    shadow: groundShadow(b),
    body: [placed({ shapes: back }), placed({ shapes: figure })],
    eyes: placed(eyes(species, b, health, false)),
    blink: health === "healthy" ? placed(eyes(species, b, health, true)) : null,
  };
}

/** The memorial stone shown after a pet passes away, in the same soft style. */
export function tombstoneArt(): PetLayer[] {
  const stone = "M58 182 L58 92 Q58 44 100 44 Q142 44 142 92 L142 182 Z";
  return [
    groundShadow(builds.adult),
    {
      shapes: [
        solid(stone, soft("#C9CBD3", 0.5, 0.34)),
        ellipse(84, 74, 12, 6, glint(0.6), -30),
        stroke("M80 104 Q100 98 120 104", "#A9ABB6", 3),
        ...[-14, 0, 14].map((dx) =>
          stroke(`M${74 + dx} 186 Q${70 + dx} 172 ${66 + dx} 166`, "#6FB35A", 3.4),
        ),
        ...[0, 72, 144, 216, 288].map((angle) =>
          ellipse(
            128 + Math.cos((angle * Math.PI) / 180) * 5,
            168 + Math.sin((angle * Math.PI) / 180) * 5,
            4.2,
            4.2,
            soft("#F49AB4", 0.45, 0.2),
          ),
        ),
        circle(128, 168, 3, soft("#F7D25A", 0.5, 0.2)),
        stroke("M128 172 L128 186", "#6FB35A", 2.4),
      ],
    },
  ];
}
