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
 * Sets the audio mode and builds every player once at launch, so the first tap does not wait on
 * audio setup and the sounds play with the same latency from the start.
 */
export function warmUpSounds(): void {
  try {
    ensureAudioMode();
    for (const effect of Object.keys(sources) as SoundEffect[]) {
      players[effect] ??= createAudioPlayer(sources[effect]);
    }
  } catch {
    // Sound is decoration; ignore.
  }
}

/**
 * Plays a short UI sound. Fire and forget: a missing audio module or a failed
 * play must never break the action that triggered it. Players are created once and
 * reused; each play rewinds first, so a rapid second tap restarts the clip.
 */
export function playSound(effect: SoundEffect): void {
  if (!useSoundEffectsStore.getState().enabled) return;
  try {
    ensureAudioMode();
    const player = (players[effect] ??= createAudioPlayer(sources[effect]));
    // A finished clip ignores play() until it is rewound, and seekTo is asynchronous: playing
    // straight after it left every tap after the first silent, because the clips are ~50 ms.
    void Promise.resolve(player.seekTo(0))
      .then(() => player.play())
      .catch(() => {
        // Sound is decoration; ignore.
      });
  } catch {
    // Sound is decoration; ignore.
  }
}

/**
 * Wraps a press handler so the tap sound plays first, for a raw `Pressable` or `Switch` that is
 * not a `Button`. A missing handler stays missing, so a disabled control remains silent.
 */
export function withTapSound<Args extends unknown[]>(
  handler: ((...args: Args) => void) | null | undefined,
): ((...args: Args) => void) | undefined {
  if (!handler) return undefined;
  return (...args) => {
    playSound("tap");
    handler(...args);
  };
}
