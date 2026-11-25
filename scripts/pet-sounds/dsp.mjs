// Bio-acoustic synthesis primitives, perceptual loudness normalization, and WAV encoding shared
// by the per-species pet sound builders in scripts/pet-sounds/.
import { Buffer } from "node:buffer";

export const SAMPLE_RATE = 22050;

// -3 dBFS peak (~0.7079) leaves clean headroom without clipping on single clips.
const MAX_PEAK = Math.pow(10, -3 / 20);
// Target active A-weighted loudness so every species and stage sits at one comfortable level,
// slightly fuller than the -22 to -24 dBA UI tap/success sounds without ever blasting.
const DEFAULT_TARGET_DBA = -17.5;

/** Seeded uniform PRNG in [-1, 1]. */
export function noiseSource(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/** Smooth low-passed random walk in [-1, 1] for organic biological pitch and amplitude drift. */
export function driftSource(seed, length, cutoffHz = 16) {
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
 * Evaluates a constant, function, `[from, to]` linear ramp, or `"u0:v0 u1:v1 ..."` / flat array
 * raised-cosine piecewise curve at normalised time `u` in [0, 1].
 */
const curveCache = new Map();
export function at(spec, u) {
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
    const u0 = spec[i];
    const v0 = spec[i + 1];
    const u1 = spec[i + 2];
    const v1 = spec[i + 3];
    if (u <= u1) {
      const t = (u - u0) / Math.max(1e-6, u1 - u0);
      return v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    }
  }
  return spec[spec.length - 1];
}

export function peak(samples) {
  let top = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i]);
    if (abs > top) top = abs;
  }
  return top;
}

/**
 * Exact unity-peak-gain 2nd-order formant resonator (`|H(e^{j*theta})| === 1.0` at resonance for
 * every frequency `freq` and bandwidth `bw`).
 */
export function resonator(input, freq, bw) {
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
export function lowpass2(input, cutoffHz) {
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

/** Smooth 2-pole high-pass filter to remove inaudible sub-bass rumble that wastes headroom. */
export function highpass2(input, cutoffHz) {
  const n = input.length;
  const out = new Float64Array(n);
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < n; i += 1) {
    const fc = Math.max(20, Math.min(SAMPLE_RATE * 0.35, at(cutoffHz, i / n)));
    const alpha = 1 - Math.exp((-2 * Math.PI * fc) / SAMPLE_RATE);
    lp1 += alpha * (input[i] - lp1);
    const hp1 = input[i] - lp1;
    lp2 += alpha * (hp1 - lp2);
    out[i] = hp1 - lp2;
  }
  return out;
}

/** Alias-free band-limited biological glottal wave at `phase` and `frequency`. */
export function glottalHarmonics(
  phase,
  frequency,
  spectralTilt = 0.88,
  maxHarmonics = 26,
  maxFraction = 0.44,
) {
  const limit = Math.min(
    maxHarmonics,
    Math.max(1, Math.floor((SAMPLE_RATE * maxFraction) / frequency)),
  );
  let sum = 0;
  for (let k = 1; k <= limit; k += 1) {
    const rolloff = Math.pow(k, -spectralTilt) * Math.cos((Math.PI * 0.42 * (k - 1)) / limit);
    sum += rolloff * Math.sin(k * phase - 0.32 * k);
  }
  return sum;
}

/**
 * Synthesizes a biological animal vocalisation with nonlinear pharyngeal/velar rattle,
 * subharmonic period-doubling, alias-free avian two-voice syrinx interaction, optional glottal
 * warmth drive, gated aspiration airflow, and time-varying vocal-tract formant resonators.
 */
export function animalCall({
  duration,
  pitch,
  spectralTilt = 0.88,
  f0Body = 0.22,
  drive = 1,
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
      Math.max(48, at(pitch, u)) *
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
      const ratio = at(syrinxTwin, u);
      const fB = f0 * ratio;
      const voicedB = glottalHarmonics(phaseB, fB, tilt + 0.1, 16);
      // Band-limit the quadratic product to 0.21 * fs each so sum frequencies stay below Nyquist.
      const imA = glottalHarmonics(phase, f0, tilt + 0.15, 8, 0.21);
      const imB = glottalHarmonics(phaseB, fB, tilt + 0.2, 8, 0.21);
      voiced = 0.58 * voiced + 0.32 * voicedB + 0.16 * imA * imB;
    }

    const d = at(drive, u);
    if (d > 1.01) {
      voiced = Math.tanh(voiced * d) / Math.tanh(d);
    }

    const shimMod = 1 + at(shimmer, u) * ampDrift[i];
    const pulseGate = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(phase), 1.6);
    source[i] = voiced * ratAm * shimMod;
    // Only add subharmonic body when the vocal model actually requests subharmonics.
    fundWave[i] = (Math.sin(phase) + 0.35 * subDepth * Math.sin(subPhase)) * ratAm * shimMod;
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
      vocalOut[i] = 0.68 * (vocalOut[i] / vPeak) + 0.32 * (c2[i] / cPeak);
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
 * Synthesizes a clean close-mic nasal snuffle, puff, or sigh without sub-bass hum, combining
 * sculpted nasal airflow, nostril valve pop, soft flutter, and optional voiced murmur (`voiceHz`).
 */
export function nasalSnuffle({
  duration,
  direction = "inhale", // "inhale" | "exhale" | "huff"
  size = "medium", // "small" | "medium" | "large"
  flutterRate = 48,
  flutterDepth = 0.42,
  voiceHz = null,
  voiceMix = 0.25,
  cutoffHz = size === "small" ? 3600 : 2500,
  seed = 1,
}) {
  const n = Math.round(duration * SAMPLE_RATE);
  const rand = noiseSource(seed);
  const drift = driftSource(seed + 55, n, 24);
  const raw = new Float64Array(n);
  const voiceRaw = new Float64Array(n);
  let vPhase = 0;
  const popFreq = size === "small" ? 1150 : size === "large" ? 380 : 560;

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const pop = Math.exp(-t / 0.0035) * Math.sin(2 * Math.PI * popFreq * t) * 0.42;
    raw[i] = rand() + pop;
    if (voiceHz) {
      const f0 = Math.max(70, at(voiceHz, u) * (1 + 0.025 * drift[i]));
      vPhase += (2 * Math.PI * f0) / SAMPLE_RATE;
      voiceRaw[i] = glottalHarmonics(vPhase, f0, 1.0, 12);
    }
  }

  const inhale = direction === "inhale";
  const bands =
    size === "small"
      ? {
          low: inhale ? [720, 1080] : [960, 620],
          mid: inhale ? [1650, 2350] : [2050, 1380],
          high: inhale ? [2750, 3450] : [3100, 2200],
          bws: [220, 400, 620],
        }
      : size === "large"
        ? {
            low: inhale ? [260, 420] : [380, 220],
            mid: inhale ? [720, 1180] : [1020, 620],
            high: inhale ? [1500, 2100] : [1800, 1120],
            bws: [150, 280, 480],
          }
        : {
            low: inhale ? [360, 560] : [500, 300],
            mid: inhale ? [960, 1520] : [1360, 820],
            high: inhale ? [1850, 2550] : [2200, 1400],
            bws: [175, 320, 520],
          };

  const bandLow = resonator(raw, bands.low, bands.bws[0]);
  const bandMid = resonator(raw, bands.mid, bands.bws[1]);
  const bandHigh = resonator(raw, bands.high, bands.bws[2]);
  const pLow = peak(bandLow) || 1;
  const pMid = peak(bandMid) || 1;
  const pHigh = peak(bandHigh) || 1;

  let voicedBand = null;
  let pVoice = 1;
  if (voiceHz) {
    const v1 = resonator(voiceRaw, bands.low, 140);
    const v2 = resonator(voiceRaw, bands.mid, 230);
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
        ? Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.006)) * Math.exp(-u * 1.9) * (1 - u * 0.25)
        : Math.sin(Math.PI * Math.pow(u, inhale ? 0.65 : 0.54));
    const flutterPhase = 2 * Math.PI * flutterRate * t + 0.45 * drift[i];
    const flutter = 1 - flutterDepth * (0.5 - 0.5 * Math.cos(flutterPhase));
    let mixVal =
      0.44 * (bandLow[i] / pLow) + 0.38 * (bandMid[i] / pMid) + 0.18 * (bandHigh[i] / pHigh);
    if (voicedBand) {
      mixVal = mixVal * (1 - voiceMix * 0.48) + (voicedBand[i] / pVoice) * voiceMix;
    }
    out[i] = mixVal * env * flutter;
  }
  return lowpass2(highpass2(out, 140), cutoffHz);
}

/**
 * Warm, organic whistle-register chirp/peep for hamsters, baby chicks, and baby hedgehogs.
 * Uses rounded oral-cavity resonance and gentle breath so it reads sweet rather than clinical.
 */
export function softChirp({
  duration,
  pitch,
  seed = 1,
  vibrato = null,
  breath = 0.08,
  harmonics = [1, 0.32, 0.1, 0.03],
  formantScale = 1.05,
  formantBw = 420,
  cutoffHz = 4200,
  attack = 0.009,
  release = 0.028,
}) {
  const n = Math.round(duration * SAMPLE_RATE);
  const rand = noiseSource(seed);
  const drift = driftSource(seed + 33, n, 18);
  const source = new Float64Array(n);
  const air = new Float64Array(n);
  let phase = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const vib = vibrato
      ? Math.pow(2, (vibrato.semitones * Math.sin(2 * Math.PI * vibrato.rate * t)) / 12)
      : 1;
    const flutter = 1 + 0.007 * Math.sin(2 * Math.PI * 24 * t) + 0.012 * drift[i];
    const f0 = at(pitch, u) * vib * flutter;
    phase += (2 * Math.PI * f0) / SAMPLE_RATE;
    let s = 0;
    for (let h = 0; h < harmonics.length; h += 1) {
      if ((h + 1) * f0 < SAMPLE_RATE * 0.43) {
        s += harmonics[h] * Math.sin((h + 1) * phase + h * 0.35);
      }
    }
    source[i] = s;
    air[i] = rand() * (0.45 + 0.55 * Math.sin(phase));
  }

  const voiced = resonator(
    source,
    (u) => Math.min(3400, Math.max(700, at(pitch, u) * formantScale)),
    formantBw,
  );
  const airBand = resonator(air, (u) => Math.min(3600, Math.max(1200, at(pitch, u) * 1.3)), 750);
  const vPeak = peak(voiced) || 1;
  const aPeak = peak(airBand) || 1;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = i / n;
    const att = Math.min(1, t / attack);
    const rel = Math.min(1, (duration - t) / release);
    const env =
      Math.sin(Math.PI * 0.5 * att) *
      Math.sin(Math.PI * 0.5 * Math.max(0, rel)) *
      (0.68 + 0.32 * Math.sin(Math.PI * u));
    const vibAm =
      vibrato && vibrato.amDepth
        ? 1 - vibrato.amDepth * (0.5 - 0.5 * Math.sin(2 * Math.PI * vibrato.rate * t))
        : 1;
    out[i] = ((voiced[i] / vPeak) * (1 - breath) + (airBand[i] / aPeak) * breath) * env * vibAm;
  }
  return lowpass2(out, cutoffHz);
}

/** Light, crystalline celesta/chime note for the dance sparkle and Legend flourishes. */
export function chimeNote(frequency, duration, decay = 0.085) {
  const n = Math.round(duration * SAMPLE_RATE);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.0022);
    const f1 =
      Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay) +
      0.34 * Math.sin(2 * Math.PI * (frequency * 1.0012 + 1.2) * t) * Math.exp(-t / (decay * 0.92));
    const f2 =
      frequency * 2 < SAMPLE_RATE * 0.44
        ? 0.2 * Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t / (decay * 0.45))
        : 0;
    const f3 =
      frequency * 2.756 < SAMPLE_RATE * 0.44
        ? 0.07 * Math.sin(2 * Math.PI * frequency * 2.756 * t) * Math.exp(-t / (decay * 0.22))
        : 0;
    out[i] = (f1 + f2 + f3) * attack;
  }
  return out;
}

/**
 * Subtle warm harmonic flourish layered gently at the end of a Legend's happy call so reaching
 * Legend feels earned without drowning the animal's real voice.
 */
export function legendShimmer(frequencies, { stepSec = 0.048, noteSec = 0.2, decay = 0.072 } = {}) {
  const parts = frequencies.map((freq, index) => [
    index * stepSec,
    chimeNote(freq, noteSec, decay),
    0.8 + index * 0.08,
  ]);
  const raw = mix(parts);
  const top = peak(raw) || 1;
  for (let i = 0; i < raw.length; i += 1) raw[i] /= top;
  return raw;
}

/** Lays sounds out on one track: each part is [startSeconds, samples, gain]. */
export function mix(parts) {
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

// IEC 61672 A-weighting linear amplitude gain at frequency f Hz (normalized to 1.0 at 1000 Hz).
function aWeightGain(f) {
  if (f <= 0) return 0;
  const f2 = f * f;
  const num = 12194 * 12194 * f2 * f2;
  const den =
    (f2 + 20.6 * 20.6) *
    Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) *
    (f2 + 12194 * 12194);
  return num / den / 0.7943282347;
}

function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

/**
 * Computes whole-clip A-weighted RMS loudness in dBA (relative to full-scale 1 kHz sine) and
 * simulated small phone-speaker loudness (with a 2nd-order 260 Hz high-pass rolloff).
 */
export function measureLoudness(samples) {
  const n = samples.length;
  if (n === 0) return { aDba: -120, phoneDb: -120 };
  let N = 1;
  while (N < n) N <<= 1;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < n; i += 1) re[i] = samples[i];
  fftRadix2(re, im);

  let aPow = 0;
  let phonePow = 0;
  for (let k = 1; k < N / 2; k += 1) {
    const f = (k * SAMPLE_RATE) / N;
    const mag2 = (re[k] * re[k] + im[k] * im[k]) * 2;
    const aw = aWeightGain(f);
    aPow += mag2 * aw * aw;
    const hp = (f * f) / (f * f + 260 * 260);
    phonePow += mag2 * hp * hp * aw * aw;
  }
  const aRms = Math.sqrt(aPow / (N * n));
  const phoneRms = Math.sqrt(phonePow / (N * n));
  return {
    aDba: 20 * Math.log10(aRms || 1e-12),
    phoneDb: 20 * Math.log10(phoneRms || 1e-12),
  };
}

/**
 * Removes DC offset and sub-audible rumble, trims silence, applies click-free fades, and
 * matches perceptual A-weighted loudness while keeping peaks below -3 dBFS via soft limiting.
 */
export function finalizeClip(
  samples,
  { targetDba = DEFAULT_TARGET_DBA, fadeOutSec = 0.028, highpassHz = 65 } = {},
) {
  const n = samples.length;
  if (n === 0) return samples;

  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += samples[i];
  mean /= n;
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i += 1) centered[i] = samples[i] - mean;

  const cleaned = highpassHz > 0 ? highpass2(centered, highpassHz) : centered;
  const rawTop = peak(cleaned) || 1;
  const startThreshold = rawTop * 0.015;
  const endThreshold = rawTop * 0.01;

  let start = 0;
  while (start < n - 1 && Math.abs(cleaned[start]) < startThreshold) start += 1;
  start = Math.max(0, start - 6);

  let end = n - 1;
  while (end > start + 1 && Math.abs(cleaned[end]) < endThreshold) end -= 1;
  end = Math.min(n, end + Math.round(0.014 * SAMPLE_RATE));

  const trimmed = cleaned.slice(start, end);
  const len = trimmed.length;

  const fadeInSamples = Math.min(Math.round(0.0025 * SAMPLE_RATE), Math.floor(len / 8));
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

  // First normalize to -3 dBFS peak, then scale toward targetDba with gentle soft-knee peak limiting.
  const basePeak = peak(trimmed) || 1;
  for (let i = 0; i < len; i += 1) trimmed[i] = (trimmed[i] / basePeak) * MAX_PEAK;

  const { aDba } = measureLoudness(trimmed);
  const desiredGain = Math.pow(10, (targetDba - aDba) / 20);
  // Allow pulling hot pure tones (hamster) down freely, and lifting quiet/high-crest clips up to +7 dB
  // with transparent soft limiting above 0.52 so peaks stay strictly <= MAX_PEAK.
  const appliedGain = Math.min(2.25, Math.max(0.18, desiredGain));
  const knee = MAX_PEAK * 0.72;
  const head = MAX_PEAK - knee;

  for (let i = 0; i < len; i += 1) {
    const x = trimmed[i] * appliedGain;
    const ax = Math.abs(x);
    if (ax <= knee) {
      trimmed[i] = x;
    } else {
      trimmed[i] = Math.sign(x) * (knee + head * Math.tanh((ax - knee) / head));
    }
  }

  // Re-anchor fade endpoints to exact zero after soft limiting.
  trimmed[0] = 0;
  trimmed[len - 1] = 0;
  return trimmed;
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
