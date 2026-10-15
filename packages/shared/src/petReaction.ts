import type { PetSpecies, PetStage } from "./pet";
import type { PetMood } from "./petArt";

// How a hatched pet answers a tap or click on the mobile and web pet pages. Purely a delight:
// nothing here reaches the Worker or earns points.

/** A healthy pet is happy, or dances after a quick run of taps; an unwell pet answers weakly. */
export type PetReaction = "happy" | "combo" | "sick" | "fading";

/** Taps inside the window that make a healthy pet dance. */
export const PET_COMBO_TAPS = 5;
export const PET_COMBO_WINDOW_MS = 2000;
/** After a dance, quick taps stay plain hops for this long. */
export const PET_COMBO_COOLDOWN_MS = 3000;

/** Recent tap times on one pet page, kept by the caller between taps. */
export interface PetTapHistory {
  taps: readonly number[];
  lastComboAt: number | null;
}

export const PET_TAP_HISTORY_START: PetTapHistory = { taps: [], lastComboAt: null };

/**
 * The reaction to a tap at `now` (milliseconds) and the history to keep for the next one. A sick
 * or fading pet never dances, so its taps do not build toward one.
 */
export function petTapReaction(
  mood: Exclude<PetMood, "egg">,
  history: PetTapHistory,
  now: number,
): { reaction: PetReaction; history: PetTapHistory } {
  if (mood === "sick") return { reaction: "sick", history: PET_TAP_HISTORY_START };
  if (mood === "fading") return { reaction: "fading", history: PET_TAP_HISTORY_START };

  const taps = [...history.taps.filter((at) => now - at < PET_COMBO_WINDOW_MS), now];
  const cooling = history.lastComboAt !== null && now - history.lastComboAt < PET_COMBO_COOLDOWN_MS;
  if (taps.length >= PET_COMBO_TAPS && !cooling) {
    return { reaction: "combo", history: { taps: [], lastComboAt: now } };
  }
  return { reaction: "happy", history: { taps, lastComboAt: history.lastComboAt } };
}

/** One glyph that floats up from the pet: its drift sideways and rise, in px, and its delay in ms. */
export interface PetBurstGlyph {
  glyph: string;
  drift: number;
  rise: number;
  delay: number;
}

/**
 * What floats up from the pet: a fan of hearts when it is happy, a wider shower with sparkles when
 * it dances, or one 🤒 or 💤 that only drifts up a little.
 */
export function petReactionBurst(reaction: PetReaction): PetBurstGlyph[] {
  const glyphs =
    reaction === "combo"
      ? ["💜", "✨", "💖", "💜", "✨", "💖", "💜", "💖"]
      : reaction === "sick"
        ? ["🤒"]
        : reaction === "fading"
          ? ["💤"]
          : ["💜", "💖", "💜", "💖"];
  if (glyphs.length === 1) return [{ glyph: glyphs[0] ?? "", drift: 0, rise: 60, delay: 0 }];
  const spread = glyphs.length > 4 ? 70 : 40;
  return glyphs.map((glyph, index) => ({
    glyph,
    drift: -spread + (2 * spread * index) / (glyphs.length - 1),
    rise: 110,
    delay: index * 60,
  }));
}

/**
 * Each reaction's motion as keyframes over `ms`: at each `at` (0 to 1) the pet lifts by `hop`
 * (a share of its size, negative is up), rocks by `tilt` degrees, and adds `squash` to its
 * vertical scale. A happy pet hops, a dancing one hops three times while rocking, a sick one
 * wobbles weakly, and a fading one barely stirs.
 */
export const PET_REACTION_MOTION: Record<
  PetReaction,
  { ms: number; at: number[]; hop: number[]; tilt: number[]; squash: number[] }
> = {
  happy: {
    ms: 450,
    at: [0, 0.3, 0.6, 0.8, 1],
    hop: [0, -0.08, 0, 0, 0],
    tilt: [0, 0, 0, 0, 0],
    squash: [0, 0.03, -0.06, 0.02, 0],
  },
  combo: {
    ms: 1100,
    at: [0, 0.16, 0.33, 0.5, 0.66, 0.83, 1],
    hop: [0, -0.1, 0, -0.1, 0, -0.14, 0],
    tilt: [0, -10, 0, 10, 0, -8, 0],
    squash: [0, 0, 0, 0, 0, 0, 0],
  },
  sick: {
    ms: 600,
    at: [0, 0.2, 0.4, 0.6, 0.8, 1],
    hop: [0, -0.02, 0, -0.01, 0, 0],
    tilt: [0, -4, 4, -3, 2, 0],
    squash: [0, 0, 0, 0, 0, 0],
  },
  fading: {
    ms: 800,
    at: [0, 0.5, 1],
    hop: [0, 0, 0],
    tilt: [0, 0, 0],
    squash: [0, 0.03, 0],
  },
};

/** Each species has a happy and a sad clip; see `scripts/generate-pet-sounds.mjs`. */
export type PetVoice = "happy" | "sad";

/** The clip's file name without its extension, the same on mobile and web. */
export function petVoiceClip(species: PetSpecies, voice: PetVoice): `${PetSpecies}-${PetVoice}` {
  return `${species}-${voice}`;
}

export interface PetSoundCue {
  voice: PetVoice;
  /** Playback rate with pitch following it, so a faster clip also sounds higher. */
  rate: number;
  volume: number;
  /** Also play the shared sparkle jingle. */
  sparkle: boolean;
}

// A baby squeaks highest and a legend sounds deepest; the species' voice stays recognisable.
const STAGE_RATE: Record<Exclude<PetStage, "egg">, number> = {
  baby: 1.25,
  juvenile: 1.12,
  adult: 1,
  legend: 0.88,
};

/** How to play a reaction for a pet at this stage. */
export function petSoundCue(stage: Exclude<PetStage, "egg">, reaction: PetReaction): PetSoundCue {
  const rate = STAGE_RATE[stage];
  if (reaction === "combo") return { voice: "happy", rate: rate * 1.15, volume: 1, sparkle: true };
  if (reaction === "sick") return { voice: "sad", rate, volume: 0.8, sparkle: false };
  if (reaction === "fading")
    return { voice: "sad", rate: rate * 0.85, volume: 0.5, sparkle: false };
  return { voice: "happy", rate, volume: 1, sparkle: false };
}
