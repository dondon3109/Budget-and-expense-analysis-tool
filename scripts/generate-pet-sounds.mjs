// Synthesizes the pet voice clips: a happy and a sad clip per species, plus the shared sparkle
// jingle a dance adds. The output is committed, so run this only to change a clip, then listen:
//
//   node scripts/generate-pet-sounds.mjs
//
// It writes the same files to apps/mobile/assets/sounds/pet/ and apps/web/public/pet/sounds/.
// Clips are cartoon voices, not recordings; the noise generator is seeded, so a run is repeatable.
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SAMPLE_RATE = 22050;

const OUTPUT_DIRS = ["apps/mobile/assets/sounds/pet", "apps/web/public/pet/sounds"];

/** A seeded uniform noise source in [-1, 1]. */
function noiseSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/** RBJ biquad band-pass (constant peak gain) or low-pass, run over a buffer. */
function biquad(input, type, frequency, q) {
  const w = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const [b0, b1, b2] =
    type === "bandpass" ? [alpha, 0, -alpha] : [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** One harmonic sample of a waveform at `phase`, built only from partials below Nyquist. */
function waveSample(wave, phase, frequency) {
  if (wave === "sine") return Math.sin(phase);
  const partials = Math.max(1, Math.floor(SAMPLE_RATE / 2.2 / frequency));
  let sum = 0;
  for (let k = 1; k <= partials; k += 1) {
    if (wave === "saw") sum += Math.sin(k * phase) / k;
    else if (k % 2 === 1) {
      // Odd partials only: square falls off as 1/k, triangle as 1/k² with alternating sign.
      sum +=
        wave === "square"
          ? Math.sin(k * phase) / k
          : ((((k - 1) / 2) % 2 ? -1 : 1) * Math.sin(k * phase)) / (k * k);
    }
  }
  return sum;
}

/**
 * One voiced sound. `pitch(u)` gives the fundamental at u in [0, 1] across the sound. Formants are
 * band-pass filters over the harmonic source; `am` adds a grunt or bleat flutter; `noise` mixes in
 * breath through its own band.
 */
function voice({
  duration,
  pitch,
  wave = "saw",
  formants = [],
  am,
  vibrato,
  noise = 0,
  noiseBand = [1500, 1],
  attack = 0.01,
  release = 0.04,
  seed = 1,
}) {
  const length = Math.round(duration * SAMPLE_RATE);
  const source = new Float64Array(length);
  const random = noiseSource(seed);
  const breath = new Float64Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / length;
    const wobble = vibrato
      ? 2 ** ((vibrato.depth * Math.sin(2 * Math.PI * vibrato.rate * t)) / 12)
      : 1;
    const frequency = pitch(u) * wobble;
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
    source[i] = waveSample(wave, phase, frequency);
    breath[i] = random();
  }
  let shaped = source;
  if (formants.length > 0) {
    shaped = new Float64Array(length);
    for (const [frequency, q, gain] of formants) {
      const band = biquad(source, "bandpass", frequency, q);
      for (let i = 0; i < length; i += 1) shaped[i] += band[i] * gain;
    }
  }
  const air = noise > 0 ? biquad(breath, "bandpass", noiseBand[0], noiseBand[1]) : null;
  const tonePeak = peak(shaped) || 1;
  const airPeak = air ? peak(air) || 1 : 1;
  const out = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.min(1, t / attack) * Math.min(1, (duration - t) / release);
    const flutter = am ? 1 - am.depth * (0.5 + 0.5 * Math.cos(2 * Math.PI * am.rate * t)) : 1;
    const tone = (shaped[i] / tonePeak) * (1 - noise);
    const hiss = air ? (air[i] / airPeak) * noise : 0;
    out[i] = (tone + hiss) * envelope * flutter;
  }
  return out;
}

/** Filtered noise with a sharp attack and an exponential tail: a sniff or a huff. */
function puff({ duration, band, q, decay, seed }) {
  const length = Math.round(duration * SAMPLE_RATE);
  const random = noiseSource(seed);
  const raw = Float64Array.from({ length }, () => random());
  const filtered = biquad(raw, "bandpass", band, q);
  const top = peak(filtered) || 1;
  return filtered.map((value, i) => {
    const t = i / SAMPLE_RATE;
    return (value / top) * Math.min(1, t / 0.006) * Math.exp(-t / decay);
  });
}

/** A bell-like note for the sparkle. */
function bell(frequency, duration) {
  const length = Math.round(duration * SAMPLE_RATE);
  return Float64Array.from({ length }, (_, i) => {
    const t = i / SAMPLE_RATE;
    const tone =
      Math.sin(2 * Math.PI * frequency * t) + 0.3 * Math.sin(4 * Math.PI * frequency * t);
    return tone * Math.min(1, t / 0.003) * Math.exp(-t / 0.09);
  });
}

function peak(samples) {
  let top = 0;
  for (const value of samples) top = Math.max(top, Math.abs(value));
  return top;
}

/** Lays sounds out on one track: each part is [start seconds, samples, gain]. */
function mix(parts) {
  const end = Math.max(
    ...parts.map(([start, samples]) => Math.round(start * SAMPLE_RATE) + samples.length),
  );
  const out = new Float64Array(end);
  for (const [start, samples, gain = 1] of parts) {
    const offset = Math.round(start * SAMPLE_RATE);
    for (let i = 0; i < samples.length; i += 1) out[offset + i] += samples[i] * gain;
  }
  return out;
}

/**
 * Scales a clip to a target loudness (RMS), so a squeak and a grunt sound equally loud, without
 * letting its peak pass 0.9.
 */
function normalize(samples, loudness) {
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  const gain = Math.min(loudness / (rms || 1), 0.9 / (peak(samples) || 1));
  return samples.map((value) => value * gain);
}

const lerp = (from, to) => (u) => from + (to - from) * u;

// Nasal formants turn a buzzy saw into a snout.
const SNOUT = [
  [500, 4, 1],
  [1100, 6, 0.7],
  [2400, 8, 0.25],
];

/** Every clip by file name (without `.wav`), as raw samples in [-1, 1]. */
export function petClips() {
  const oink = (seed, from, to) =>
    voice({
      duration: 0.17,
      pitch: (u) => from + (to - from) * Math.sin(Math.PI * u),
      formants: SNOUT,
      am: { rate: 34, depth: 0.35 },
      noise: 0.15,
      noiseBand: [1200, 1.5],
      seed,
    });
  const squeak = (duration, from, to, seed) =>
    voice({
      duration,
      pitch: lerp(from, to),
      wave: "triangle",
      attack: 0.005,
      release: 0.02,
      seed,
    });
  const honk = (duration, from, to, seed) =>
    voice({
      duration,
      pitch: lerp(from, to),
      wave: "square",
      formants: [
        [1000, 3, 1],
        [1800, 5, 0.6],
      ],
      am: { rate: 40, depth: 0.25 },
      noise: 0.1,
      noiseBand: [1600, 1],
      seed,
    });
  const grunt = (duration, pitch, seed) =>
    voice({
      duration,
      pitch,
      formants: [
        [350, 3, 1],
        [800, 4, 0.6],
      ],
      am: { rate: 25, depth: 0.5 },
      noise: 0.08,
      noiseBand: [500, 1],
      attack: 0.03,
      release: 0.08,
      seed,
    });

  const clips = {
    // Pig: a nasal double grunt, then a low single snort.
    "pig-happy": mix([
      [0, oink(11, 190, 250)],
      [0.24, oink(12, 210, 280)],
    ]),
    "pig-sad": voice({
      duration: 0.32,
      pitch: lerp(150, 100),
      formants: SNOUT,
      am: { rate: 28, depth: 0.5 },
      noise: 0.35,
      noiseBand: [900, 1.2],
      seed: 13,
    }),

    // Panda: a soft two-part bleat that rises, then a slow falling whimper.
    "panda-happy": mix([
      [
        0,
        voice({
          duration: 0.18,
          pitch: lerp(600, 680),
          wave: "triangle",
          formants: [
            [900, 3, 1],
            [2000, 5, 0.4],
          ],
          am: { rate: 16, depth: 0.5 },
          seed: 21,
        }),
      ],
      [
        0.23,
        voice({
          duration: 0.26,
          pitch: lerp(680, 780),
          wave: "triangle",
          formants: [
            [900, 3, 1],
            [2000, 5, 0.4],
          ],
          am: { rate: 14, depth: 0.6 },
          seed: 22,
        }),
      ],
    ]),
    "panda-sad": voice({
      duration: 0.55,
      pitch: lerp(560, 380),
      wave: "triangle",
      formants: [
        [800, 3, 1],
        [1800, 5, 0.3],
      ],
      am: { rate: 10, depth: 0.4 },
      vibrato: { rate: 6, depth: 0.4 },
      release: 0.15,
      seed: 23,
    }),

    // Hamster: three quick high squeaks, then one thin falling one.
    "hamster-happy": mix([
      [0, squeak(0.07, 2400, 3000, 31)],
      [0.11, squeak(0.07, 2500, 3100, 32)],
      [0.22, squeak(0.09, 2600, 3300, 33)],
    ]),
    "hamster-sad": voice({
      duration: 0.2,
      pitch: lerp(2000, 1500),
      wave: "triangle",
      vibrato: { rate: 12, depth: 0.5 },
      attack: 0.005,
      release: 0.05,
      seed: 34,
    }),

    // Penguin: an "awk-awk" honk, then a short low honk.
    "penguin-happy": mix([
      [0, honk(0.13, 420, 480, 41)],
      [0.2, honk(0.13, 480, 540, 42)],
    ]),
    "penguin-sad": honk(0.3, 300, 250, 43),

    // Hedgehog: four sniffs and a tiny eep, then one slow huff.
    "hedgehog-happy": mix([
      ...[0, 0.1, 0.2, 0.3].map((start, index) => [
        start,
        puff({ duration: 0.06, band: 4500, q: 2, decay: 0.02, seed: 51 + index }),
      ]),
      [0.42, squeak(0.06, 1800, 2200, 55), 0.6],
    ]),
    "hedgehog-sad": mix([
      [0, puff({ duration: 0.45, band: 2000, q: 1, decay: 0.15, seed: 56 })],
      [
        0,
        voice({ duration: 0.4, pitch: lerp(300, 220), wave: "sine", release: 0.2, seed: 57 }),
        0.25,
      ],
    ]),

    // Hippo: a deep rumbly "hrumph" with a short second grunt, then a long low groan.
    "hippo-happy": mix([
      [0, grunt(0.35, (u) => 95 + 25 * Math.sin(Math.PI * u) - 10 * u, 61)],
      [0.4, grunt(0.18, lerp(110, 90), 62)],
    ]),
    "hippo-sad": grunt(0.65, lerp(90, 60), 63),

    // Sparkle: a quick bell arpeggio, G6 C7 E7 G7.
    sparkle: mix(
      [1568, 2093, 2637, 3136].map((frequency, index) => [index * 0.06, bell(frequency, 0.3)]),
    ),
  };

  return Object.fromEntries(
    Object.entries(clips).map(([name, samples]) => [
      name,
      normalize(samples, name.endsWith("-sad") ? 0.13 : 0.17),
    ]),
  );
}

/** 16-bit mono PCM WAV, the format of the other UI sounds. */
export function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const clips = petClips();
  for (const dir of OUTPUT_DIRS) {
    mkdirSync(join(root, dir), { recursive: true });
    for (const [name, samples] of Object.entries(clips)) {
      writeFileSync(join(root, dir, `${name}.wav`), encodeWav(samples));
    }
  }
  console.log(`Wrote ${Object.keys(clips).length} clips to ${OUTPUT_DIRS.join(" and ")}.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
