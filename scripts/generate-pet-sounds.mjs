// Synthesizes the 13 pet sound effects: a happy and a sad vocalisation per species at adult pitch,
// plus the shared sparkle chime played when a pet dances. Output files are committed, so run this
// whenever tuning the vocal models and listen to the result:
//
//   node scripts/generate-pet-sounds.mjs
//
// Writes identical 22050 Hz, 16-bit mono PCM WAV files to apps/mobile/assets/sounds/pet/ and
// apps/web/public/pet/sounds/. Each species uses a seeded bio-acoustic vocal-tract model matched
// to its vocal anatomy (pharyngeal snort-grunts and diphthongal snout oinks for pig; laryngeal
// whistle-register squeaks for hamster; close-mic wet-nose snuffles, palatal huffs, and soft nasal
// truffle-chuffs for hedgehog; deep cavernous wheeze-honks and bass grunts for hippo; quivering
// "mie" bleats and huffs for panda; and dual-membrane avian syrinx bray-chirps for penguin),
// trimmed with no leading silence, a short fade-out, and normalised to -3 dBFS peak.
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SAMPLE_RATE = 22050;

// -3 dBFS peak (~0.7079), giving consistent headroom without clipping.
const TARGET_PEAK = Math.pow(10, -3 / 20);

const OUTPUT_DIRS = ["apps/mobile/assets/sounds/pet", "apps/web/public/pet/sounds"];

/** Seeded uniform PRNG in [-1, 1]. */
function noiseSource(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/** Smooth low-passed random walk in [-1, 1] for organic biological pitch and amplitude drift. */
function driftSource(seed, length, cutoffHz = 16) {
  const rand = noiseSource(seed);
  const out = new Float64Array(length);
  const alpha = Math.min(1, (2 * Math.PI * cutoffHz) / SAMPLE_RATE);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < length; i += 1) {
    y1 += alpha * (rand() - y1);
    y2 += alpha * (y1 - y2);
    out[i] = y2;
  }
  const top = peak(out) || 1;
  for (let i = 0; i < length; i += 1) out[i] /= top;
  return out;
}

/**
 * Evaluates a constant, function, `[from, to]` linear ramp, or flat `[u0, v0, u1, v1, ...]`
 * raised-cosine piecewise curve at normalised time `u` in [0, 1].
 */
const curveCache = new Map();
function at(spec, u) {
  if (typeof spec === "number") return spec;
  if (typeof spec === "function") return spec(u);
  if (typeof spec === "string") {
    let pts = curveCache.get(spec);
    if (!pts) {
      pts = spec.split(" ").flatMap((pair) => pair.split(":").map(Number));
      curveCache.set(spec, pts);
    }
    spec = pts;
  }
  if (spec.length === 2) return spec[0] + (spec[1] - spec[0]) * u;
  if (u <= spec[0]) return spec[1];
  for (let i = 0; i < spec.length - 2; i += 2) {
    const u0 = spec[i],
      v0 = spec[i + 1],
      u1 = spec[i + 2],
      v1 = spec[i + 3];
    if (u <= u1) {
      const t = (u - u0) / Math.max(1e-6, u1 - u0);
      return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    }
  }
  return spec[spec.length - 1];
}

/**
 * Exact unity-peak-gain 2nd-order formant resonator (`|H(e^{j*theta})| === 1.0` at resonance for
 * every frequency `freq` and bandwidth `bw`).
 */
function resonator(input, freq, bw) {
  const n = input.length;
  const out = new Float64Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const nyquist = SAMPLE_RATE * 0.45;
  for (let i = 0; i < n; i += 1) {
    const u = i / n;
    const f = Math.max(40, Math.min(nyquist, at(freq, u)));
    const b = Math.max(25, at(bw, u));
    const r = Math.exp((-Math.PI * b) / SAMPLE_RATE);
    const a1 = 2 * r * Math.cos((2 * Math.PI * f) / SAMPLE_RATE);
    const a2 = -r * r;
    const b0 = 1 - r;
    const x = input[i];
    const y = b0 * (x - r * x2) + a1 * y1 + a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Smooth 2-pole low-pass filter to remove harsh high-frequency hiss. */
function lowpass2(input, cutoffHz) {
  const n = input.length;
  const out = new Float64Array(n);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i += 1) {
    const fc = Math.max(100, Math.min(SAMPLE_RATE * 0.45, at(cutoffHz, i / n)));
    const alpha = 1 - Math.exp((-2 * Math.PI * fc) / SAMPLE_RATE);
    y1 += alpha * (input[i] - y1);
    y2 += alpha * (y1 - y2);
    out[i] = y2;
  }
  return out;
}

/** Alias-free band-limited biological glottal wave at `phase` and `frequency`. */
function glottalHarmonics(phase, frequency, spectralTilt = 0.88, maxHarmonics = 26) {
  const limit = Math.min(maxHarmonics, Math.max(1, Math.floor((SAMPLE_RATE * 0.44) / frequency)));
  let sum = 0;
  for (let k = 1; k <= limit; k += 1) {
    const rolloff = Math.pow(k, -spectralTilt) * Math.cos((Math.PI * 0.42 * (k - 1)) / limit);
    sum += rolloff * Math.sin(k * phase - 0.32 * k);
  }
  return sum;
}

/**
 * Synthesizes a biological animal vocalisation with nonlinear pharyngeal/velar rattle,
 * subharmonic period-doubling, optional avian two-voice syrinx interaction, gated aspiration
 * airflow, and time-varying vocal-tract formant resonators.
 */
function animalCall({
  duration,
  pitch,
  spectralTilt = 0.88,
  f0Body = 0.25,
  jitter = 0.025,
  shimmer = 0.1,
  subharmonics = 0,
  rattle = null, // { rate, fmSemitones, amDepth }
  vibrato = null, // { rate, semitones, amDepth }
  syrinxTwin = null,
  formants = [],
  aspiration = 0.1,
  aspirationFormants = null,
  cutoffHz = 4800,
  attack = 0.01,
  release = 0.03,
  contour = null,
  seed = 1,
}) {
  const n = Math.round(duration * SAMPLE_RATE);
  const rand = noiseSource(seed);
  const pitchDrift = driftSource(seed + 101, n, 16);
  const ampDrift = driftSource(seed + 202, n, 20);

  const source = new Float64Array(n);
  const fundWave = new Float64Array(n);
  const airRaw = new Float64Array(n);
  let phase = 0;
  let subPhase = 0;
  let phaseB = 0;
  let rattlePhase = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const vibSemis = vibrato ? vibrato.semitones * Math.sin(2 * Math.PI * vibrato.rate * t) : 0;
    let ratSemis = 0;
    let ratAm = 1;
    if (rattle) {
      const rRate = at(rattle.rate, u) * (1 + 0.12 * pitchDrift[i]);
      rattlePhase += rRate / SAMPLE_RATE;
      if (rattlePhase >= 1) rattlePhase -= 1;
      const rWave =
        Math.sin(2 * Math.PI * rattlePhase) + 0.35 * Math.sin(4 * Math.PI * rattlePhase - 0.4);
      ratSemis = at(rattle.fmSemitones ?? 0, u) * rWave;
      const amD = at(rattle.amDepth ?? 0, u);
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * rattlePhase), 1.5);
      ratAm = 1 - amD + amD * pulse;
    }

    const f0 =
      Math.max(38, at(pitch, u)) *
      Math.pow(2, (vibSemis + ratSemis) / 12) *
      (1 + at(jitter, u) * pitchDrift[i]);

    const tilt = at(spectralTilt, u);
    let voiced = glottalHarmonics(phase, f0, tilt);

    const subDepth = at(subharmonics, u);
    if (subDepth > 0) {
      const subWave =
        Math.sin(subPhase - 0.3) +
        0.52 * Math.sin(3 * subPhase - 0.6) +
        0.28 * Math.sin(5 * subPhase - 0.9);
      voiced = (1 - subDepth * 0.38) * voiced + subDepth * subWave;
    }

    if (syrinxTwin) {
      const fB = f0 * at(syrinxTwin, u);
      const voicedB = glottalHarmonics(phaseB, fB, tilt + 0.1, 16);
      voiced = 0.56 * voiced + 0.32 * voicedB + 0.22 * voiced * voicedB;
    }

    const shimMod = 1 + at(shimmer, u) * ampDrift[i];
    const pulseGate = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
    source[i] = voiced * ratAm * shimMod;
    fundWave[i] = (Math.sin(phase) + 0.35 * Math.sin(subPhase)) * ratAm * shimMod;
    airRaw[i] = rand() * pulseGate * ratAm;

    phase += (2 * Math.PI * f0) / SAMPLE_RATE;
    subPhase += (Math.PI * f0) / SAMPLE_RATE;
    if (syrinxTwin) {
      phaseB += (2 * Math.PI * f0 * at(syrinxTwin, u)) / SAMPLE_RATE;
    }
  }

  const vocalOut = new Float64Array(n);
  for (let m = 0; m < formants.length; m += 1) {
    const [fFn, bwFn, gFn = 1] = formants[m];
    const band = resonator(source, fFn, bwFn);
    for (let i = 0; i < n; i += 1) {
      vocalOut[i] += band[i] * at(gFn, i / n);
    }
  }

  // Cascade reinforcement of the first two formants so snout/throat resonances lock together.
  if (formants.length >= 2) {
    const c1 = resonator(source, formants[0][0], formants[0][1]);
    const c2 = resonator(c1, formants[1][0], formants[1][1]);
    const cPeak = peak(c2) || 1;
    const vPeak = peak(vocalOut) || 1;
    for (let i = 0; i < n; i += 1) {
      vocalOut[i] = 0.65 * (vocalOut[i] / vPeak) + 0.35 * (c2[i] / cPeak);
    }
  }

  const vPeak = peak(vocalOut) || 1;
  const fPeak = peak(fundWave) || 1;
  for (let i = 0; i < n; i += 1) {
    const fb = at(f0Body, i / n);
    vocalOut[i] = (vocalOut[i] / vPeak) * (1 - fb * 0.38) + (fundWave[i] / fPeak) * fb;
  }

  const airSpecs = aspirationFormants ?? formants.slice(0, 2);
  const airOut = new Float64Array(n);
  for (let m = 0; m < airSpecs.length; m += 1) {
    const [fFn, bwFn, gFn = 1] = airSpecs[m];
    const band = resonator(airRaw, fFn, (u) => at(bwFn, u) * 1.4);
    for (let i = 0; i < n; i += 1) {
      airOut[i] += band[i] * at(gFn, i / n);
    }
  }

  const vTop = peak(vocalOut) || 1;
  const aTop = peak(airOut) || 1;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const asp = at(aspiration, u);
    const combined = (vocalOut[i] / vTop) * (1 - asp * 0.4) + (airOut[i] / aTop) * asp;
    const att = attack > 0 ? Math.min(1, t / attack) : 1;
    const rel = release > 0 ? Math.min(1, (duration - t) / release) : 1;
    const env = Math.sin(Math.PI * 0.5 * att) * Math.sin(Math.PI * 0.5 * Math.max(0, rel));
    const shape = contour ? at(contour, u) : 1;
    const vibAm =
      vibrato && vibrato.amDepth
        ? 1 - vibrato.amDepth * (0.5 - 0.5 * Math.sin(2 * Math.PI * vibrato.rate * t))
        : 1;
    out[i] = combined * env * shape * vibAm;
  }
  return lowpass2(out, cutoffHz);
}

/**
 * Synthesizes a close-mic nasal snuffle, chuff, or defensive huff with warm nasal-turbinate body,
 * nostril valve pop, soft-palate flutter, and optional voiced nasal truffle-murmur (`voiceHz`).
 */
function nasalSnuffle({
  duration,
  direction = "inhale", // "inhale" | "exhale" | "huff"
  size = "medium", // "small" (hedgehog) | "medium" (pig, panda)
  flutterRate = 54,
  flutterDepth = 0.52,
  voiceHz = null,
  voiceMix = 0.22,
  cutoffHz = size === "small" ? 4500 : 2600,
  seed = 1,
}) {
  const n = Math.round(duration * SAMPLE_RATE);
  const rand = noiseSource(seed);
  const drift = driftSource(seed + 55, n, 25);
  const raw = new Float64Array(n);
  const voiceRaw = new Float64Array(n);
  let vPhase = 0;
  const popFreq = size === "small" ? 1350 : 520;

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const pop = Math.exp(-t / 0.0032) * Math.sin(2 * Math.PI * popFreq * t) * 0.48;
    raw[i] = rand() + pop;
    if (voiceHz) {
      const f0 = at(voiceHz, u) * (1 + 0.025 * drift[i]);
      vPhase += (2 * Math.PI * f0) / SAMPLE_RATE;
      voiceRaw[i] = glottalHarmonics(vPhase, f0, 1.05, 10);
    }
  }

  const inhale = direction === "inhale";
  const fLow =
    size === "small" ? (inhale ? [820, 1280] : [1120, 740]) : inhale ? [340, 540] : [480, 270];
  const fMid =
    size === "small" ? (inhale ? [1950, 2950] : [2550, 1650]) : inhale ? [950, 1620] : [1420, 820];
  const fHigh =
    size === "small"
      ? inhale
        ? [3300, 4400]
        : [3950, 2750]
      : inhale
        ? [1950, 2950]
        : [2450, 1450];

  const bandLow = resonator(raw, fLow, size === "small" ? 260 : 175);
  const bandMid = resonator(raw, fMid, size === "small" ? 480 : 340);
  const bandHigh = resonator(raw, fHigh, size === "small" ? 750 : 580);
  const pLow = peak(bandLow) || 1;
  const pMid = peak(bandMid) || 1;
  const pHigh = peak(bandHigh) || 1;

  let voicedBand = null;
  let pVoice = 1;
  if (voiceHz) {
    const v1 = resonator(voiceRaw, fLow, 150);
    const v2 = resonator(voiceRaw, fMid, 240);
    voicedBand = new Float64Array(n);
    for (let i = 0; i < n; i += 1) voicedBand[i] = 0.68 * v1[i] + 0.32 * v2[i];
    pVoice = peak(voicedBand) || 1;
  }

  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const env =
      direction === "huff"
        ? Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.005)) * Math.exp(-u * 2.1) * (1 - u * 0.2)
        : Math.sin(Math.PI * Math.pow(u, inhale ? 0.65 : 0.52));
    const flutterPhase = 2 * Math.PI * flutterRate * t + 0.45 * drift[i];
    const flutter = 1 - flutterDepth * (0.5 - 0.5 * Math.cos(flutterPhase));
    const palatalThump = size === "small" ? 0 : 0.22 * Math.sin(flutterPhase);
    let mixVal =
      (size === "small" ? 0.34 : 0.46) * (bandLow[i] / pLow) +
      0.4 * (bandMid[i] / pMid) +
      (size === "small" ? 0.26 : 0.14) * (bandHigh[i] / pHigh) +
      palatalThump;
    if (voicedBand) {
      mixVal = mixVal * (1 - voiceMix * 0.35) + (voicedBand[i] / pVoice) * voiceMix;
    }
    out[i] = mixVal * env * flutter;
  }
  return lowpass2(out, cutoffHz);
}

/**
 * Synthesizes a realistic pig oink-grunt: a brief wet nostril-velar snort followed by a low
 * pharyngeal grunt (`gruntHz` ~ 102-112 Hz) that sweeps upward into a bright nasal `[ɔɪŋk]`
 * diphthong (`oinkHz` ~ 268-338 Hz) before pinching shut at the velum.
 */
function pigOink(duration, gruntHz, oinkHz, oinkAmount, seed) {
  const snort = nasalSnuffle({
    duration: Math.min(0.038, duration * 0.28),
    direction: "inhale",
    flutterRate: 48,
    flutterDepth: 0.62,
    cutoffHz: 2400,
    seed: seed + 50,
  });
  const peakHz = gruntHz + (oinkHz - gruntHz) * oinkAmount;
  const call = animalCall({
    duration,
    pitch: [
      0,
      gruntHz * 0.92,
      0.32,
      gruntHz * 1.12,
      0.74,
      peakHz,
      0.9,
      peakHz * 0.86,
      1,
      gruntHz * 1.05,
    ],
    spectralTilt: "0:0.58 0.38:0.55 0.78:0.72 1:0.85",
    f0Body: "0:0.22 0.38:0.18 0.78:0.08 1:0.14",
    jitter: 0.045,
    shimmer: 0.16,
    subharmonics: "0:0.54 0.38:0.44 0.75:0.12 1:0.18",
    rattle: {
      rate: [38, 46],
      fmSemitones: "0:0.45 0.42:0.35 0.8:0.1 1:0.15",
      amDepth: "0:0.52 0.42:0.42 0.78:0.14 1:0.2",
    },
    aspiration: "0:0.24 0.45:0.16 0.82:0.1 1:0.22",
    aspirationFormants: [
      [380, 180, 1.0],
      [1150, 380, 0.75],
    ],
    formants: [
      ["0:340 0.38:420 0.78:310 1:260", 80, 0.85],
      ["0:520 0.36:640 0.76:420 1:330", 105, 1.0],
      [[0, 780, 0.34, 920, 0.78, 960 + 980 * oinkAmount, 1, 1380], 130, 1.0],
      [[0, 1850, 0.36, 2050, 0.78, 2150 + 620 * oinkAmount, 1, 2280], 200, 0.58],
    ],
    cutoffHz: 4200,
    attack: 0.006,
    release: 0.02,
    contour: "0:0.68 0.22:0.94 0.42:0.84 0.76:1.0 1:0.08",
    seed,
  });
  return mix([
    [0.0, snort, 0.36],
    [0.01, call, 1.0],
  ]);
}

/**
 * One organic small-rodent squeak/chirp: smooth whistle-register laryngeal oscillation with
 * curved pitch scoops and natural oral-cavity resonance.
 */
function hamsterChirp(duration, pitchCurve, seed, vibrato = null, breath = 0.03) {
  const n = Math.round(duration * SAMPLE_RATE);
  const rand = noiseSource(seed);
  const drift = driftSource(seed + 33, n, 20);
  const source = new Float64Array(n);
  const air = new Float64Array(n);
  let phase = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const vib = vibrato
      ? Math.pow(2, (vibrato.semitones * Math.sin(2 * Math.PI * vibrato.rate * t)) / 12)
      : 1;
    const flutter = 1 + 0.008 * Math.sin(2 * Math.PI * 28 * t) + 0.011 * drift[i];
    const f0 = at(pitchCurve, u) * vib * flutter;
    phase += (2 * Math.PI * f0) / SAMPLE_RATE;
    source[i] =
      Math.sin(phase) + 0.24 * Math.sin(2 * phase + 0.3) + 0.06 * Math.sin(3 * phase + 0.7);
    air[i] = rand() * (0.4 + 0.6 * Math.sin(phase));
  }

  const voiced = resonator(
    source,
    (u) => Math.min(3600, Math.max(1300, at(pitchCurve, u) * 1.02)),
    360,
  );
  const airBand = resonator(air, 3200, 1000);
  const vPeak = peak(voiced) || 1;
  const aPeak = peak(airBand) || 1;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const att = Math.min(1, t / 0.007);
    const rel = Math.min(1, (duration - t) / 0.022);
    const env =
      Math.sin(Math.PI * 0.5 * att) *
      Math.sin(Math.PI * 0.5 * Math.max(0, rel)) *
      (0.74 + 0.26 * Math.sin(Math.PI * u));
    const vibAm =
      vibrato && vibrato.amDepth
        ? 1 - vibrato.amDepth * (0.5 - 0.5 * Math.sin(2 * Math.PI * vibrato.rate * t))
        : 1;
    out[i] = ((voiced[i] / vPeak) * (1 - breath) + (airBand[i] / aPeak) * breath) * env * vibAm;
  }
  return out;
}

/** Light, crystalline celesta/chime note for the dance sparkle. */
function chimeNote(frequency, duration) {
  const n = Math.round(duration * SAMPLE_RATE);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.0018);
    const f1 =
      Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / 0.085) +
      0.38 * Math.sin(2 * Math.PI * (frequency * 1.0012 + 1.5) * t) * Math.exp(-t / 0.08);
    const f2 = 0.22 * Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t / 0.038);
    const f3 = 0.09 * Math.sin(2 * Math.PI * frequency * 2.756 * t) * Math.exp(-t / 0.018);
    out[i] = (f1 + f2 + f3) * attack;
  }
  return out;
}

function peak(samples) {
  let top = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i]);
    if (abs > top) top = abs;
  }
  return top;
}

/** Lays sounds out on one track: each part is [startSeconds, samples, gain]. */
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
 * Removes DC offset, trims any leading or trailing silence, applies a short click-free onset and
 * raised-cosine fade-out, and normalises the peak to -3 dBFS (~0.708).
 */
function finalizeClip(samples, { fadeOutSec = 0.028 } = {}) {
  const n = samples.length;
  if (n === 0) return samples;

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += samples[i];
  mean /= n;
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i += 1) centered[i] = samples[i] - mean;

  const rawTop = peak(centered) || 1;
  const startThreshold = rawTop * 0.015;
  const endThreshold = rawTop * 0.008;

  let start = 0;
  while (start < n - 1 && Math.abs(centered[start]) < startThreshold) start += 1;
  start = Math.max(0, start - 6);

  let end = n - 1;
  while (end > start + 1 && Math.abs(centered[end]) < endThreshold) end -= 1;
  end = Math.min(n, end + Math.round(0.012 * SAMPLE_RATE));

  const trimmed = centered.slice(start, end);
  const len = trimmed.length;

  const fadeInSamples = Math.min(Math.round(0.002 * SAMPLE_RATE), Math.floor(len / 8));
  const fadeOutSamples = Math.min(Math.round(fadeOutSec * SAMPLE_RATE), Math.floor(len / 3));

  for (let i = 0; i < fadeInSamples; i += 1) {
    const s = 0.5 - 0.5 * Math.cos((Math.PI * (i + 1)) / (fadeInSamples + 1));
    trimmed[i] *= s;
  }
  for (let i = 0; i < fadeOutSamples; i += 1) {
    const idx = len - 1 - i;
    const s = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOutSamples);
    trimmed[idx] *= s;
  }

  const top = peak(trimmed) || 1;
  const gain = TARGET_PEAK / top;
  for (let i = 0; i < len; i += 1) {
    trimmed[i] = Math.max(-1, Math.min(1, trimmed[i] * gain));
  }
  return trimmed;
}

function mediumSnuffle(duration, direction, flutterRate, flutterDepth, seed, cutoffHz = 2600) {
  return nasalSnuffle({ duration, direction, flutterRate, flutterDepth, cutoffHz, seed });
}

function hedgehogSniff(dur, dir, rate, depth, voiceHz, voiceMix, seed, cutoffHz = 4500) {
  return nasalSnuffle({
    duration: dur,
    direction: dir,
    size: "small",
    flutterRate: rate,
    flutterDepth: depth,
    voiceHz,
    voiceMix,
    cutoffHz,
    seed,
  });
}

function hippoChuck(dur, pitch, f1a, f1b, f1c, f2a, f2b, f2c, f3, rattleRate, seed) {
  const uMid = dur > 0.14 ? 0.42 : 0.45;
  return animalCall({
    duration: dur,
    pitch,
    spectralTilt: 0.7,
    f0Body: 0.48,
    jitter: 0.045,
    shimmer: 0.16,
    subharmonics: 0.56,
    rattle: { rate: rattleRate, fmSemitones: 2.5, amDepth: 0.54 },
    aspiration: rattleRate > 30 ? 0.2 : 0.18,
    formants: [
      [[0, f1a, uMid, f1b, 1, f1c], 75, 1.0],
      [[0, f2a, uMid, f2b, 1, f2c], 115, 0.78],
      [f3, 190, 0.34],
    ],
    cutoffHz: 2600,
    attack: 0.009,
    release: dur > 0.14 ? 0.03 : 0.026,
    seed,
  });
}

function pandaBleat(dur, pitch, f1a, f1b, f2a, f2b, f3a, seed) {
  const sad = dur > 0.3;
  const mid = dur > 0.2 && !sad;
  return animalCall({
    duration: dur,
    pitch,
    spectralTilt: sad ? 1.05 : 0.98,
    jitter: sad ? 0.028 : 0.02,
    shimmer: sad ? 0.14 : 0.1,
    vibrato: sad
      ? { rate: 12.0, semitones: 1.2, amDepth: 0.28 }
      : mid
        ? { rate: 15.5, semitones: 1.6, amDepth: 0.36 }
        : { rate: 16.0, semitones: 1.4, amDepth: 0.32 },
    rattle: {
      rate: sad ? 44 : mid ? 54 : 56,
      fmSemitones: sad ? 0.3 : 0.35,
      amDepth: sad ? 0.16 : 0.18,
    },
    aspiration: sad ? 0.18 : mid ? 0.12 : 0.16,
    formants: [
      [[f1a, f1b], 90, 1.0],
      [[f2a, f2b], 160, sad ? 0.72 : 0.82],
      [sad ? [f3a, 2450] : f3a, 260, sad ? 0.25 : 0.32],
    ],
    attack: sad ? 0.015 : mid ? 0.012 : 0.01,
    release: sad ? 0.055 : mid ? 0.032 : 0.028,
    seed,
  });
}

function penguinChirp(dur, pitch, f1a, f1b, f1c, f2a, f2b, f2c, seed) {
  const long = dur > 0.15;
  const mid = seed === 602;
  const uMid = long ? 0.42 : 0.5;
  return animalCall({
    duration: dur,
    pitch,
    spectralTilt: long ? 0.82 : 0.85,
    syrinxTwin: long ? 1.052 : mid ? 1.048 : 1.045,
    rattle: {
      rate: long ? 64 : mid ? 72 : 68,
      fmSemitones: long ? 1.15 : mid ? 0.95 : 0.9,
      amDepth: long ? 0.38 : mid ? 0.34 : 0.32,
    },
    aspiration: long ? 0.1 : 0.08,
    formants: [
      [[0, f1a, uMid, f1b, 1, f1c], long ? 145 : 150, 1.0],
      [[0, f2a, uMid, f2b, 1, f2c], long ? 250 : 260, long ? 0.8 : mid ? 0.78 : 0.75],
    ],
    attack: long ? 0.008 : 0.007,
    release: long ? 0.03 : 0.02,
    seed,
  });
}

/** Every clip by file name (without `.wav`), as raw samples in [-1, 1]. */
export function petClips() {
  const clips = {
    // Pig: three quick, bright snort-oinks (`[ɔɪŋk]`) when happy; a strained nasal whine that
    // sags into a deep, gravelly snout grunt when sad.
    "pig-happy": mix([
      [0.0, pigOink(0.13, 102, 268, 0.82, 101), 0.86],
      [0.145, pigOink(0.14, 112, 305, 0.94, 102), 0.94],
      [0.3, pigOink(0.175, 106, 338, 1.0, 103), 1.0],
    ]),
    "pig-sad": mix([
      [0.0, mediumSnuffle(0.06, "inhale", 38, 0.55, 105, 1800), 0.38],
      [
        0.02,
        animalCall({
          duration: 0.54,
          pitch: "0:142 0.18:178 0.36:132 0.54:82 0.78:66 1:54",
          spectralTilt: "0:0.76 0.42:0.64 1:0.7",
          f0Body: "0:0.28 0.45:0.44 1:0.5",
          jitter: 0.05,
          shimmer: 0.18,
          subharmonics: "0:0.28 0.42:0.58 1:0.64",
          vibrato: { rate: 9.5, semitones: 0.32, amDepth: 0.12 },
          rattle: {
            rate: [34, 22],
            fmSemitones: "0:0.3 0.42:0.48 1:0.52",
            amDepth: "0:0.28 0.42:0.54 1:0.6",
          },
          aspiration: "0:0.18 0.5:0.25 1:0.34",
          aspirationFormants: [
            [330, 170, 1.0],
            [880, 340, 0.65],
          ],
          formants: [
            ["0:330 0.22:370 0.5:290 1:225", 78, 1.0],
            ["0:1120 0.22:1340 0.5:720 1:520", 115, 0.92],
            ["0:1980 0.22:2180 0.5:1520 1:1180", 185, 0.45],
          ],
          cutoffHz: 3000,
          attack: 0.014,
          release: 0.08,
          contour: "0:0.52 0.18:0.92 0.38:0.76 0.56:1.0 0.84:0.58 1:0.08",
          seed: 104,
        }),
        1.0,
      ],
    ]),

    // Hamster: three quick, sweet, curved rodent squeak-chirps when happy; two soft, trembling
    // falling whimper-squeaks when sad.
    "hamster-happy": mix([
      [0.0, hamsterChirp(0.085, "0:1680 0.42:2680 0.75:2520 1:1980", 201), 0.82],
      [0.105, hamsterChirp(0.09, "0:1850 0.45:2960 0.78:2780 1:2180", 202), 0.92],
      [
        0.215,
        hamsterChirp(0.195, "0:1780 0.28:3120 0.52:2680 0.76:3240 1:2050", 203, {
          rate: 26,
          semitones: 0.28,
          amDepth: 0.1,
        }),
        1.0,
      ],
    ]),
    "hamster-sad": mix([
      [
        0.0,
        hamsterChirp(
          0.145,
          "0:2080 0.22:2240 0.72:1680 1:1440",
          204,
          { rate: 14, semitones: 0.35, amDepth: 0.15 },
          0.04,
        ),
        0.78,
      ],
      [
        0.17,
        hamsterChirp(
          0.285,
          "0:1880 0.16:1980 0.55:1480 0.85:1240 1:1120",
          205,
          { rate: 12.5, semitones: 0.5, amDepth: 0.22 },
          0.05,
        ),
        1.0,
      ],
    ]),

    // Hedgehog: five brisk, inquisitive close-mic wet-nose snuffles and light purring truffle-chuffs
    // when happy; a sharp defensive hedgehog huff followed by a receding nasal sigh-huff when sad.
    "hedgehog-happy": mix([
      [0.0, hedgehogSniff(0.064, "inhale", 64, 0.52, [540, 680], 0.14, 301), 0.78],
      [0.074, hedgehogSniff(0.068, "exhale", 58, 0.56, [580, 740], 0.18, 302), 0.85],
      [0.154, hedgehogSniff(0.088, "huff", 68, 0.62, "0:620 0.45:840 1:680", 0.28, 303), 0.94],
      [0.254, hedgehogSniff(0.064, "inhale", 66, 0.54, [590, 750], 0.16, 304), 0.82],
      [0.33, hedgehogSniff(0.115, "huff", 70, 0.64, "0:660 0.42:920 1:740", 0.32, 305), 1.0],
    ]),
    "hedgehog-sad": mix([
      [0.0, hedgehogSniff(0.135, "huff", 58, 0.68, [620, 460], 0.2, 307, 4200), 1.0],
      [0.155, hedgehogSniff(0.12, "huff", 48, 0.62, [540, 390], 0.24, 308, 3600), 0.82],
      [0.29, hedgehogSniff(0.2, "exhale", 36, 0.54, "0:580 0.45:420 1:320", 0.3, 309, 3000), 0.74],
    ]),

    // Hippo: a deep, brassy wheeze-honk followed by two bouncy bass chuckle-grunts when happy;
    // a deep, heavy, cavernous groan-wheeze and wet nostril sigh when sad.
    "hippo-happy": mix([
      [
        0.0,
        animalCall({
          duration: 0.28,
          pitch: "0:74 0.25:98 0.55:142 0.82:106 1:78",
          spectralTilt: 0.68,
          f0Body: 0.42,
          jitter: 0.035,
          shimmer: 0.14,
          subharmonics: 0.52,
          rattle: { rate: [28, 36], fmSemitones: 2.2, amDepth: 0.48 },
          aspiration: 0.2,
          aspirationFormants: [
            [340, 170, 1.0],
            [820, 320, 0.6],
          ],
          formants: [
            ["0:210 0.52:360 1:230", 75, 1.0],
            ["0:520 0.52:860 1:560", 115, 0.85],
            ["0:1220 0.52:1620 1:1280", 185, 0.42],
          ],
          cutoffHz: 2900,
          attack: 0.014,
          release: 0.032,
          contour: "0:0.45 0.22:0.88 0.54:1.0 0.85:0.76 1:0.14",
          seed: 401,
        }),
        1.0,
      ],
      [
        0.3,
        hippoChuck(0.135, "0:88 0.4:114 1:68", 225, 315, 195, 550, 730, 490, 1280, 30, 402),
        0.92,
      ],
      [
        0.45,
        hippoChuck(0.145, "0:92 0.38:118 1:64", 235, 330, 190, 570, 760, 480, 1320, 32, 403),
        0.88,
      ],
    ]),
    "hippo-sad": animalCall({
      duration: 0.62,
      pitch: "0:84 0.18:90 0.55:62 0.85:48 1:42",
      spectralTilt: 0.74,
      f0Body: 0.52,
      jitter: 0.055,
      shimmer: 0.18,
      subharmonics: 0.6,
      rattle: { rate: [26, 17], fmSemitones: 2.6, amDepth: 0.58 },
      aspiration: "0:0.18 0.5:0.24 1:0.34",
      aspirationFormants: [
        [300, 150, 1.0],
        [720, 300, 0.55],
      ],
      formants: [
        [[255, 165], 70, 1.0],
        [[600, 400], 110, 0.76],
        [[1280, 980], 185, 0.3],
      ],
      cutoffHz: 2300,
      attack: 0.02,
      release: 0.095,
      contour: "0:0.42 0.2:1.0 0.65:0.78 1:0.08",
      seed: 404,
    }),

    // Panda: a brisk panda nose-huff followed by an affectionate, quivering giant-panda "mie"
    // chirp-bleat and happy chuff when happy; a trembling, falling bleat-whimper and tired nasal
    // huff-sigh when sad.
    "panda-happy": mix([
      [0.0, mediumSnuffle(0.08, "huff", 48, 0.45, 501), 0.42],
      [
        0.07,
        pandaBleat(0.28, "0:490 0.28:660 0.68:720 1:580", 460, 540, 1950, 2350, 3250, 502),
        1.0,
      ],
      [0.365, pandaBleat(0.145, "0:540 0.45:760 1:610", 480, 560, 2050, 2450, 3350, 503), 0.9],
    ]),
    "panda-sad": mix([
      [0.0, pandaBleat(0.34, "0:560 0.18:580 0.6:410 1:310", 480, 340, 2050, 1380, 3100, 504), 1.0],
      [0.31, mediumSnuffle(0.22, "huff", 34, 0.48, 505), 0.48],
    ]),

    // Penguin: three brisk, high-spirited avian syrinx chirp-brays when happy; a drooping, raspy
    // syrinx bray-whimper when sad.
    "penguin-happy": mix([
      [
        0.0,
        penguinChirp(
          0.11,
          "0:680 0.45:1280 0.78:1140 1:880",
          1350,
          1950,
          1550,
          2950,
          3850,
          3200,
          601,
        ),
        0.85,
      ],
      [
        0.13,
        penguinChirp(
          0.115,
          "0:740 0.45:1420 0.78:1260 1:960",
          1450,
          2100,
          1650,
          3100,
          4050,
          3350,
          602,
        ),
        0.92,
      ],
      [
        0.265,
        penguinChirp(
          0.195,
          "0:640 0.35:1240 0.68:1080 1:760",
          1280,
          1880,
          1380,
          2850,
          3750,
          2950,
          603,
        ),
        1.0,
      ],
    ]),
    "penguin-sad": animalCall({
      duration: 0.48,
      pitch: "0:860 0.16:920 0.55:580 0.85:420 1:350",
      spectralTilt: 0.9,
      syrinxTwin: 1.058,
      rattle: { rate: [58, 36], fmSemitones: 1.1, amDepth: 0.38 },
      aspiration: "0:0.1 0.6:0.18 1:0.28",
      formants: [
        [[1680, 880], 150, 1.0],
        [[3350, 2050], 250, 0.72],
      ],
      attack: 0.014,
      release: 0.08,
      contour: "0:0.45 0.18:1.0 0.65:0.74 1:0.08",
      seed: 604,
    }),

    // Sparkle: a crisp, twinkling 6-note celesta chime arpeggio (C6 E6 G6 B6 D7 G7) under 0.6 s.
    sparkle: mix(
      [1046.5, 1318.5, 1568.0, 1975.5, 2349.3, 3136.0].map((frequency, index) => [
        index * 0.042,
        chimeNote(frequency, 0.25 - index * 0.008),
        0.78 + index * 0.04,
      ]),
    ),
  };

  return Object.fromEntries(
    Object.entries(clips).map(([name, samples]) => [name, finalizeClip(samples)]),
  );
}

/** 16-bit mono PCM WAV, matching the format of the other UI sounds. */
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
