import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import errorSource from "../../../assets/sounds/error.wav";
import successSource from "../../../assets/sounds/success.wav";
import tapSource from "../../../assets/sounds/tap.wav";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

const sources = { tap: tapSource, success: successSource, error: errorSource } as const;

export type SoundEffect = keyof typeof sources;

// A bundled asset, as `import clip from "….wav"` gives it.
type ClipSource = number;

// Keyed by asset, so the UI sounds and the pet voices share one player each.
const players = new Map<ClipSource, AudioPlayer>();
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
    for (const source of Object.values(sources)) playerFor(source);
  } catch {
    // Sound is decoration; ignore.
  }
}

/** Builds the players for clips a screen is about to play, so its first play is not late. */
export function warmUpClips(clips: readonly ClipSource[]): void {
  try {
    for (const source of clips) playerFor(source);
  } catch {
    // Sound is decoration; ignore.
  }
}

function playerFor(source: ClipSource): AudioPlayer {
  let player = players.get(source);
  if (!player) {
    player = createAudioPlayer(source);
    players.set(source, player);
  }
  return player;
}

/**
 * Plays a short UI sound. Fire and forget: a missing audio module or a failed
 * play must never break the action that triggered it.
 */
export function playSound(effect: SoundEffect): void {
  playClip(sources[effect]);
}

/**
 * Plays any bundled clip under the same rules as `playSound`: only while sounds are on, and fire
 * and forget. Players are created once and reused; each play rewinds first, so a rapid second tap
 * restarts the clip. A `rate` other than 1 also moves the pitch, so a faster clip sounds higher.
 */
export function playClip(
  source: ClipSource,
  options: { rate?: number; volume?: number } = {},
): void {
  if (!useSoundEffectsStore.getState().enabled) return;
  try {
    ensureAudioMode();
    const player = playerFor(source);
    if (options.rate !== undefined) {
      player.shouldCorrectPitch = false;
      player.setPlaybackRate(options.rate);
    }
    if (options.volume !== undefined) player.volume = options.volume;
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
