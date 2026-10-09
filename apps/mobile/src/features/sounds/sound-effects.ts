import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import errorSource from "../../../assets/sounds/error.wav";
import successSource from "../../../assets/sounds/success.wav";
import tapSource from "../../../assets/sounds/tap.wav";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const sources = { tap: tapSource, success: successSource, error: errorSource } as const;

export type SoundEffect = keyof typeof sources;

const players: Partial<Record<SoundEffect, AudioPlayer>> = {};
let audioModeSet = false;

// Set the mode explicitly instead of relying on the library default, so a muted
// or vibrate ringer does not silence the clips. Mixing keeps music playing.
function ensureAudioMode(): void {
  if (audioModeSet) return;
  audioModeSet = true;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {
    audioModeSet = false;
  });
}

/**
 * Plays a short UI sound. Fire and forget: a missing audio module or a failed
 * play must never break the action that triggered it. Players are created on
 * first use and reused, so a rapid second tap restarts the clip.
 */
export function playSound(effect: SoundEffect): void {
  if (!useSoundEffectsStore.getState().enabled) return;
  try {
    ensureAudioMode();
    const player = (players[effect] ??= createAudioPlayer(sources[effect]));
    void player.seekTo(0);
    player.play();
  } catch {
    // Sound is decoration; ignore.
  }
}

/** Wraps a press handler so the tap sound plays first, for a raw `Pressable` that is not a `Button`. */
export function withTapSound<Args extends unknown[]>(
  handler: (...args: Args) => void,
): (...args: Args) => void {
  return (...args) => {
    playSound("tap");
    handler(...args);
  };
}
