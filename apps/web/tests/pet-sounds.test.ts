// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { soundEffectsPreference } from "../src/lib/browserPreferences";

interface FakeAudio {
  src: string;
  preload: string;
  preservesPitch: boolean;
  playbackRate: number;
  volume: number;
  currentTime: number;
  muted: boolean;
  play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  pause: ReturnType<typeof vi.fn<() => void>>;
}

describe("petSounds", () => {
  let created: FakeAudio[];
  let originalAudio: typeof Audio | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    created = [];
    originalAudio = globalThis.Audio;
    const AudioStub = vi.fn(function (this: FakeAudio, src: string) {
      this.src = src;
      this.preload = "";
      this.preservesPitch = true;
      this.playbackRate = 1;
      this.volume = 1;
      this.currentTime = 0;
      this.muted = false;
      this.play = vi.fn(async () => undefined);
      this.pause = vi.fn();
      created.push(this);
      return this;
    });
    vi.stubGlobal("Audio", AudioStub);
    soundEffectsPreference.set(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalAudio === undefined) {
      vi.unstubAllGlobals();
    } else {
      vi.stubGlobal("Audio", originalAudio);
    }
    soundEffectsPreference.set(true);
  });

  it("skips preloading clips when Sound effects are off", async () => {
    soundEffectsPreference.set(false);
    const { warmUpPetVoices } = await import("../src/lib/petSounds");

    warmUpPetVoices("hippo", "adult");

    expect(created).toHaveLength(0);
  });

  it("preloads only the current stage's happy, sad, and sparkle clips", async () => {
    const { warmUpPetVoices } = await import("../src/lib/petSounds");

    warmUpPetVoices("hippo", "adult");

    expect(created.map((audio) => audio.src)).toEqual([
      "/pet/sounds/hippo-adult-happy.wav",
      "/pet/sounds/hippo-adult-sad.wav",
      "/pet/sounds/sparkle.wav",
    ]);
    expect(created.every((audio) => audio.preservesPitch === false)).toBe(true);
  });

  it("plays each stage's own clip and staggers sparkle on a combo dance", async () => {
    const { playPetReaction } = await import("../src/lib/petSounds");

    playPetReaction("hippo", "legend", "combo");

    expect(created.map((audio) => audio.src)).toEqual(["/pet/sounds/hippo-legend-happy.wav"]);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
    expect(created[0]?.playbackRate).toBe(1.06);
    expect(created[0]?.volume).toBe(0.9);

    vi.advanceTimersByTime(90);

    expect(created.map((audio) => audio.src)).toEqual([
      "/pet/sounds/hippo-legend-happy.wav",
      "/pet/sounds/sparkle.wav",
    ]);
    expect(created[1]?.play).toHaveBeenCalledTimes(1);
    expect(created[1]?.volume).toBe(0.72);
  });

  it("unlocks hatch audio muted during the gesture and plays sparkle before baby voice", async () => {
    const { playPetHatch, unlockPetHatchAudio } = await import("../src/lib/petSounds");

    unlockPetHatchAudio("hippo");
    expect(created.map((audio) => audio.src)).toEqual([
      "/pet/sounds/sparkle.wav",
      "/pet/sounds/hippo-baby-happy.wav",
    ]);
    expect(created[0]?.muted).toBe(true);
    expect(created[1]?.muted).toBe(true);

    await Promise.resolve();
    expect(created[0]?.pause).toHaveBeenCalledTimes(1);
    expect(created[0]?.muted).toBe(false);
    expect(created[1]?.pause).toHaveBeenCalledTimes(1);
    expect(created[1]?.muted).toBe(false);

    playPetHatch("hippo");
    expect(created[0]?.play).toHaveBeenCalledTimes(2);
    expect(created[1]?.play).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(160);
    expect(created[1]?.play).toHaveBeenCalledTimes(2);
    expect(created[1]?.muted).toBe(false);
  });

  it("stays silent when Sound effects are turned off", async () => {
    soundEffectsPreference.set(false);
    const { playPetHatch, playPetReaction, unlockPetHatchAudio } =
      await import("../src/lib/petSounds");

    unlockPetHatchAudio("pig");
    playPetReaction("pig", "adult", "happy");
    playPetHatch("pig");
    vi.advanceTimersByTime(500);

    expect(created).toHaveLength(0);
  });
});
