import {
  petHatchSoundCue,
  petSoundCue,
  petVoiceClip,
  type PetHatchedStage,
  type PetReaction,
  type PetSpecies,
} from "@zoption/shared";

import { playClip, playHaptic, warmUpClips } from "@/features/sounds/sound-effects";
import { petVoiceAssets, sparkleAsset } from "./pet-sound-assets";

let delayedClipTimer: ReturnType<typeof setTimeout> | null = null;

function clearDelayedClip(): void {
  if (delayedClipTimer !== null) {
    clearTimeout(delayedClipTimer);
    delayedClipTimer = null;
  }
}

function scheduleClip(
  source: number,
  delayMs: number,
  options?: { rate?: number; volume?: number },
): void {
  clearDelayedClip();
  delayedClipTimer = setTimeout(() => {
    delayedClipTimer = null;
    playClip(source, options);
  }, delayMs);
}

/** Loads one pet's current-stage voices and the sparkle ahead of the first tap. */
export function warmUpPetVoices(species: PetSpecies, stage: PetHatchedStage): void {
  warmUpClips([
    petVoiceAssets[petVoiceClip(species, stage, "happy")],
    petVoiceAssets[petVoiceClip(species, stage, "sad")],
    sparkleAsset,
  ]);
}

/**
 * Answers a tap on the pet with its stage-specific voice (plus a staggered sparkle on a dance)
 * and a buzz: the UI tap tick for a tap, the success click for a dance. The voice follows the
 * Sound effects switch; the buzz follows the system's haptics setting. Both are fire and forget.
 */
export function playPetReaction(
  species: PetSpecies,
  stage: PetHatchedStage,
  reaction: PetReaction,
): void {
  clearDelayedClip();
  const cue = petSoundCue(species, stage, reaction);
  playClip(petVoiceAssets[cue.clip], { rate: cue.rate, volume: cue.volume });
  if (cue.sparkle) {
    scheduleClip(sparkleAsset, cue.sparkle.delayMs, { volume: cue.sparkle.volume });
  }
  playHaptic(reaction === "combo" ? "success" : "tap");
}

/** Celebrates an egg hatching with the sparkle jingle, the Baby's happy voice, and a success buzz. */
export function playPetHatch(species: PetSpecies): void {
  clearDelayedClip();
  const cue = petHatchSoundCue(species);
  playClip(sparkleAsset, { volume: cue.sparkleVolume });
  scheduleClip(petVoiceAssets[cue.voiceClip], cue.voiceDelayMs, {
    rate: 1,
    volume: cue.voiceVolume,
  });
  playHaptic("success");
}
