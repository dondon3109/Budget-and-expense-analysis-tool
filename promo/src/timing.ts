// Single source of truth for the cut. Change a number here and the scenes,
// captions, sound effects and music ducking all re-sync.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Seconds → frames. */
export const f = (sec: number) => Math.round(sec * FPS);

// Cuts sit on the 120 BPM beat grid of the music (a beat is 0.5s, grid starts at 1.5s).
export const SCENES = {
  intro: { from: 0, dur: 525 }, // 17.5s, your Zoption-video clip (hook + problem)
  reveal: { from: 525, dur: 150 },
  demo1: { from: 675, dur: 270 },
  demo2: { from: 945, dur: 255 },
  demo3: { from: 1200, dur: 210 },
  offer: { from: 1410, dur: 330 },
  cta: { from: 1740, dur: 165 },
} as const;
export const TOTAL_FRAMES = 1905; // 63.5s

/** Voice starts a few frames into each scene so the cut lands before the first word. */
export const VOICE_OFFSET = 3;

export type SceneKey = Exclude<keyof typeof SCENES, "intro">;
export type Segment = { text: string; start: number; end: number };

/**
 * One entry per voiceover clip. `segments` are the spoken phrases with start/end in
 * seconds *inside the clip*, taken from the pauses detected in the recordings
 * (ffmpeg silencedetect). Captions and animation cues hang off these.
 */
export const VOICE: Record<SceneKey, { file: string; segments: Segment[] }> = {
  reveal: {
    file: "voiceover/0.12–0.17 REVEAL.m4a",
    segments: [
      { text: "So I switched to Zoption.", start: 0.15, end: 2.2 },
      { text: "Budgeting that takes seconds.", start: 2.62, end: 4.38 },
    ],
  },
  demo1: {
    file: "voiceover/0.17–0.30 DEMO 1.m4a",
    segments: [
      {
        text: "I tap the widget and just say it: I spent 250 on Jollibee for lunch and 2,000 on groceries.",
        start: 0.22,
        end: 4.18,
      },
      { text: "Two entries,", start: 4.69, end: 5.3 },
      { text: "logged.", start: 5.53, end: 5.89 },
      { text: "No typing.", start: 6.28, end: 7.04 },
      { text: "No opening the app.", start: 7.23, end: 8.2 },
    ],
  },
  demo2: {
    file: "voiceover/0.30–0.40 DEMO 2-AI assistant.m4a",
    segments: [
      { text: "Or just chat with the AI assistant.", start: 0.29, end: 2.22 },
      {
        text: "Tell it what's left in your GCash and it works out what you spent.",
        start: 2.55,
        end: 5.61,
      },
      { text: "You confirm before anything is saved.", start: 5.93, end: 7.75 },
    ],
  },
  demo3: {
    file: "voiceover/0.40–0.48 DEMO 3.m4a",
    segments: [
      { text: "And every morning,", start: 0.32, end: 1.39 },
      { text: "one number:", start: 1.56, end: 2.4 },
      { text: "how much you can actually spend today,", start: 2.67, end: 4.57 },
      { text: "so you stop guessing.", start: 4.85, end: 6.2 },
    ],
  },
  offer: {
    file: "voiceover/0.48–0.56 OFFER.m4a",
    segments: [
      { text: "New here?", start: 0.17, end: 0.72 },
      { text: "You get 7 days of Zoption Pro free", start: 1.31, end: 3.86 },
      { text: "when you sign up.", start: 3.99, end: 4.7 },
      { text: "No credit card.", start: 5.04, end: 5.93 },
      { text: "If you don't want it,", start: 6.57, end: 7.3 },
      { text: "you just drop to the Free plan.", start: 7.56, end: 8.96 },
      { text: "You won't be charged.", start: 9.31, end: 10.26 },
    ],
  },
  cta: {
    file: "voiceover/0.56–1.00 CTA.m4a",
    segments: [
      { text: "Download Zoption.", start: 0.3, end: 1.39 },
      { text: "Start your free Pro week today.", start: 1.57, end: 3.34 },
    ],
  },
};

/** Absolute second of a moment inside a scene's voice clip. */
export const voiceAt = (scene: SceneKey, sec: number) =>
  (SCENES[scene].from + VOICE_OFFSET) / FPS + sec;

// Music grid: 120 BPM, first beat at 1.5s, so 17.5s (the reveal) is beat 32 = a bar line.
export const MUSIC = { file: "audio/music.mp3", bpm: 120, firstBeat: 1.5 };

export type Sfx = { at: number; file: string; volume?: number };
/** Sound effects on the timeline, in absolute seconds. Files come from scripts/make-audio.mjs. */
export const SFX: Sfx[] = [
  // reveal
  { at: 17.5, file: "impact", volume: 1 },
  { at: 17.28, file: "whoosh", volume: 0.8 },
  { at: 18.05, file: "sparkle", volume: 0.6 },
  { at: 19.3, file: "pop", volume: 0.5 },
  { at: 20.05, file: "pop", volume: 0.5 },
  // scene wipes
  { at: 22.25, file: "whoosh", volume: 0.7 },
  { at: 31.25, file: "whoosh", volume: 0.7 },
  { at: 39.75, file: "whoosh", volume: 0.7 },
  { at: 46.75, file: "whoosh", volume: 0.8 },
  { at: 57.75, file: "whoosh", volume: 0.8 },
  // demo 1: tap the widget, dictation, entries logged
  { at: voiceAt("demo1", 0.55), file: "tap", volume: 0.9 },
  { at: voiceAt("demo1", 0.62), file: "mic-on", volume: 0.7 },
  { at: voiceAt("demo1", 4.72), file: "pop", volume: 0.8 },
  { at: voiceAt("demo1", 5.0), file: "pop", volume: 0.8 },
  { at: voiceAt("demo1", 5.52), file: "coin", volume: 0.8 },
  { at: voiceAt("demo1", 5.62), file: "notify", volume: 0.6 },
  { at: voiceAt("demo1", 6.3), file: "stamp", volume: 0.5 },
  // demo 2: chat, draft, save
  { at: voiceAt("demo2", 0.45), file: "pop", volume: 0.5 },
  { at: voiceAt("demo2", 2.75), file: "type", volume: 0.5 },
  { at: voiceAt("demo2", 4.1), file: "swipe", volume: 0.6 },
  { at: voiceAt("demo2", 4.6), file: "pop", volume: 0.7 },
  { at: voiceAt("demo2", 6.55), file: "tap", volume: 0.9 },
  { at: voiceAt("demo2", 6.75), file: "success", volume: 0.8 },
  // demo 3: donut, safe-to-spend count-up
  { at: voiceAt("demo3", 0.32), file: "swipe", volume: 0.6 },
  { at: voiceAt("demo3", 1.56), file: "stamp", volume: 0.8 },
  { at: voiceAt("demo3", 1.6), file: "count", volume: 0.7 },
  { at: voiceAt("demo3", 4.85), file: "success", volume: 0.8 },
  // offer
  { at: voiceAt("offer", 0.17), file: "pop", volume: 0.7 },
  { at: voiceAt("offer", 1.31), file: "swipe", volume: 0.6 },
  { at: voiceAt("offer", 3.4), file: "stamp", volume: 1 },
  { at: voiceAt("offer", 3.42), file: "confetti", volume: 0.9 },
  { at: voiceAt("offer", 5.04), file: "pop", volume: 0.7 },
  { at: voiceAt("offer", 5.55), file: "stamp", volume: 0.6 },
  { at: voiceAt("offer", 7.56), file: "swipe", volume: 0.6 },
  { at: voiceAt("offer", 9.31), file: "stamp", volume: 1 },
  { at: voiceAt("offer", 9.33), file: "confetti", volume: 0.9 },
  // cta
  { at: voiceAt("cta", 0.3), file: "pop", volume: 0.7 },
  { at: voiceAt("cta", 1.57), file: "sparkle", volume: 0.8 },
  { at: voiceAt("cta", 1.6), file: "success", volume: 0.8 },
];

/** Frame inside a scene (relative) at which a moment of its voice clip is spoken. */
export const vf = (sec: number) => VOICE_OFFSET + Math.round(sec * FPS);
