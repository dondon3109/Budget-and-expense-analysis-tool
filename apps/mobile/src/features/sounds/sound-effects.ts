import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import errorSource from "../../../assets/sounds/error.wav";
import successSource from "../../../assets/sounds/success.wav";
import tapSource from "../../../assets/sounds/tap.wav";
import { useSoundEffectsStore } from "@/stores/sound-effects-store";

// `select` shares the tap clip; only its buzz is lighter.
const sources = {
  select: tapSource,
  tap: tapSource,
  success: successSource,
  error: errorSource,
} as const;

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
 * Plays a short UI sound and its matching buzz. Fire and forget: a missing audio module or a
 * failed play must never break the action that triggered it. The sound follows the Sound effects
 * switch; the buzz follows the system's haptics setting instead, so muting sounds keeps it.
 *
 * Pick the effect by what the press does, so the buzz stays subtle and graded: `select` for
 * picking, toggling, expanding, or keying a choice (the faintest tick), `tap` for a button or row
 * that acts or navigates, and `success` / `error` for the outcome of a save.
 */
export function playSound(effect: SoundEffect): void {
  playHaptic(effect);
  playClip(sources[effect]);
}

/**
 * Buzzes for an effect without its sound, for a press that plays its own clip (the pet's voice).
 * Android uses the view's own haptic feedback rather than a vibrator waveform, because only that
 * honours the system "Touch feedback" switch and keeps the native, subtle intensities.
 */
export function playHaptic(effect: SoundEffect): void {
  try {
    const buzz =
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(androidHaptics[effect])
        : iosHaptic(effect);
    buzz.catch(() => {
      // Haptics are decoration; a device without them stays quiet.
    });
  } catch {
    // Haptics are decoration; ignore.
  }
}

// Lightest to strongest: Clock_Tick is the texture tick a picker wheel makes, Context_Click a
// short tick, Confirm a single click, Reject a double click. The two ticks exist on every Android
// version; Confirm and Reject need API 30, and older phones skip that buzz (the call rejects).
const androidHaptics = {
  select: Haptics.AndroidHaptics.Clock_Tick,
  tap: Haptics.AndroidHaptics.Context_Click,
  success: Haptics.AndroidHaptics.Confirm,
  error: Haptics.AndroidHaptics.Reject,
} as const satisfies Record<SoundEffect, Haptics.AndroidHaptics>;

// An error uses the warning pattern: the error one is a heavy triple buzz, too harsh for a
// failed save the screen already explains.
function iosHaptic(effect: SoundEffect): Promise<void> {
  if (effect === "select") return Haptics.selectionAsync();
  if (effect === "tap") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (effect === "success")
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
 * not a `Button`. Pass `select` for a choice, toggle, or expander. A missing handler stays
 * missing, so a disabled control remains silent.
 */
export function withTapSound<Args extends unknown[]>(
  handler: ((...args: Args) => void) | null | undefined,
  effect: "tap" | "select" = "tap",
): ((...args: Args) => void) | undefined {
  if (!handler) return undefined;
  return (...args) => {
    playSound(effect);
    handler(...args);
  };
}
