import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import errorSource from "../../../assets/sounds/error.wav";
import successSource from "../../../assets/sounds/success.wav";
import tapSource from "../../../assets/sounds/tap.wav";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const sources = { tap: tapSource, success: successSource, error: errorSource } as const;

export type SoundEffect = keyof typeof sources;

const players: Partial<Record<SoundEffect, AudioPlayer>> = {};

/**
 * Plays a short UI sound. Fire and forget: a missing audio module or a failed
 * play must never break the action that triggered it. Players are created on
 * first use and reused, so a rapid second tap restarts the clip.
 */
export function playSound(effect: SoundEffect): void {
  if (!useSoundEffectsStore.getState().enabled) return;
  try {
    const player = (players[effect] ??= createAudioPlayer(sources[effect]));
    void player.seekTo(0);
    player.play();
  } catch {
    // Sound is decoration; ignore.
  }
}
