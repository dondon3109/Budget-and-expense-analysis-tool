// Synthesises the background music and every sound effect, so the video has no
// licensed audio. Output: public/audio/*.mp3 (needs ffmpeg on PATH).
//
// Music grid: 120 BPM, first beat at 1.5s. The reveal at 17.5s is beat 32, a bar line,
// so the drop lands exactly on the cut. Keep MUSIC in src/timing.ts in sync.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
mkdirSync(OUT, { recursive: true });

const BEAT = 0.5;
const T0 = 1.5;
const DROP = 17.5;
const END_STAB = 62.0;
const TOTAL = 66;

// ---------- small DSP toolkit ----------
let seed = 1337;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const exp = Math.exp;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** One-pole low-pass coefficient for a cutoff in Hz. */
const lpCoef = (hz) => 1 - exp((-TAU * Math.min(hz, SR / 2.2)) / SR);

/** State-variable filter; returns a function (x, cutoffHz, q) => {lp, bp, hp}. */
function svf() {
  let lp = 0;
  let bp = 0;
  return (x, hz, q = 0.7) => {
    // The Chamberlin form blows up above ~fs/6, so clamp the cutoff.
    const g = 2 * Math.sin((Math.PI * Math.min(hz, SR / 6.5)) / SR);
    const hp = x - lp - bp / q;
    bp += g * hp;
    lp += g * bp;
    return { lp, bp, hp };
  };
}

/** Mix `src` into stereo bus at `at` seconds. */
function mixInto(bus, src, at, gain = 1, pan = 0) {
  const start = Math.floor(at * SR);
  const l = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const r = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < src.length; i++) {
    const j = start + i;
    if (j < 0 || j >= bus.l.length) continue;
    bus.l[j] += src[i] * l;
    bus.r[j] += src[i] * r;
  }
}
const newBus = (sec) => ({ l: buf(sec), r: buf(sec) });

// ---------- instruments (each returns a mono Float32Array) ----------
function kick() {
  const o = buf(0.5);
  let ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    ph += (TAU * (46 + 120 * exp(-t * 28))) / SR;
    const click = i < 90 ? (1 - i / 90) * 0.5 : 0;
    o[i] = Math.tanh(1.6 * Math.sin(ph) * exp(-t * 7.5)) + click;
  }
  return o;
}
function clap() {
  const o = buf(0.35);
  const f = svf();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const burst = [0, 0.011, 0.022].reduce((a, d) => a + (t > d ? exp(-(t - d) * 90) : 0), 0);
    const tail = exp(-t * 16) * 0.7;
    o[i] = f(noise(), 1700, 1.4).bp * (burst * 0.5 + tail) * 2.2;
  }
  return o;
}
function hat(open = false) {
  const o = buf(open ? 0.4 : 0.08);
  const f = svf();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = f(noise(), 7500, 0.6).hp * exp(-t * (open ? 11 : 70)) * 0.55;
  }
  return o;
}
function snare(len = 0.25) {
  const o = buf(len);
  const f = svf();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = f(noise(), 3200, 0.8).hp * exp(-t * 20) * 0.7 + Math.sin(TAU * 190 * t) * exp(-t * 28) * 0.5;
  }
  return o;
}
function bass(freq, len) {
  const o = buf(len + 0.15);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    ph += (freq / SR) % 1;
    ph %= 1;
    const saw = ph * 2 - 1;
    lp += lpCoef(260 + 900 * exp(-t * 12)) * (saw - lp);
    const env = Math.min(1, t * 120) * (t < len ? 1 : exp(-(t - len) * 40));
    o[i] = Math.tanh(1.8 * (lp * 0.8 + Math.sin(TAU * freq * t) * 0.55)) * env * 0.55;
  }
  return o;
}
function pluck(freq, len = 0.5) {
  const o = buf(len);
  let p1 = 0;
  let p2 = 0.3;
  let lp = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    p1 = (p1 + freq / SR) % 1;
    p2 = (p2 + (freq * 1.006) / SR) % 1;
    lp += lpCoef(500 + 5200 * exp(-t * 14)) * (p1 * 2 - 1 + (p2 * 2 - 1) - lp);
    o[i] = lp * exp(-t * 6.5) * Math.min(1, t * 400) * 0.32;
  }
  return o;
}
function pad(freqs, len) {
  const o = buf(len + 1.2);
  const lps = freqs.map(() => 0);
  const phs = freqs.map((_, k) => k * 0.17);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.5) * (t < len ? 1 : exp(-(t - len) * 4));
    let s = 0;
    freqs.forEach((fr, k) => {
      for (const d of [0.994, 1, 1.007]) {
        phs[k] = (phs[k] + (fr * d) / SR) % 1;
        s += (phs[k] * 2 - 1) * 0.12;
      }
      lps[k] += lpCoef(1100 + 500 * Math.sin(t * 0.8)) * (s - lps[k]);
    });
    o[i] = lps.reduce((a, v) => a + v, 0) * env * 0.5;
  }
  return o;
}
function lead(freq, len) {
  const o = buf(len + 0.25);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    const vib = 1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t * 4);
    ph = (ph + (freq * vib) / SR) % 1;
    const sq = ph < 0.5 ? 1 : -1;
    lp += lpCoef(2600) * ((sq * 0.5 + (ph * 2 - 1) * 0.5) - lp);
    const env = Math.min(1, t * 60) * (t < len ? 1 : exp(-(t - len) * 14));
    o[i] = lp * env * 0.3;
  }
  return o;
}
/** Inharmonic bell, the "sparkle" building block. */
function bell(freq, len = 1.2, bright = 1) {
  const o = buf(len);
  const partials = [
    [1, 1, 3.2],
    [2.76, 0.5 * bright, 4.5],
    [5.4, 0.28 * bright, 6.5],
    [8.93, 0.14 * bright, 9],
  ];
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    let s = 0;
    for (const [m, a, d] of partials) s += Math.sin(TAU * freq * m * t) * a * exp(-t * d);
    o[i] = s * Math.min(1, t * 900) * 0.4;
  }
  return o;
}
function noiseSweep(len, fromHz, toHz, q = 1.5, peak = 0.5) {
  const o = buf(len);
  const f = svf();
  for (let i = 0; i < o.length; i++) {
    const p = i / o.length;
    const hz = fromHz * (toHz / fromHz) ** p;
    const env = Math.sin(Math.PI * Math.min(1, p ** 0.7)) ** 1.5;
    o[i] = f(noise(), hz, q).bp * env * peak * 3;
  }
  return o;
}
function boom(len = 1.8, freq = 52) {
  const o = buf(len);
  let ph = 0;
  const f = svf();
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    ph += (TAU * (freq + 90 * exp(-t * 18))) / SR;
    o[i] =
      Math.tanh(1.4 * Math.sin(ph)) * exp(-t * 2.4) * 0.9 +
      f(noise(), 900, 0.7).lp * exp(-t * 9) * 0.5 +
      (i < 200 ? noise() * 0.5 : 0);
  }
  return o;
}

// ---------- reverb (Schroeder: parallel combs into series all-pass) ----------
function reverb(bus, wet = 0.35, decay = 0.78) {
  const mono = bus.l.map((v, i) => (v + bus.r[i]) * 0.5);
  const tune = (arr) =>
    arr.map((ms) => Math.floor((ms / 1000) * SR));
  const run = (src, combs, aps) => {
    const out = new Float32Array(src.length);
    for (const d of combs) {
      const line = new Float32Array(d);
      let lp = 0;
      let p = 0;
      for (let i = 0; i < src.length; i++) {
        const y = line[p];
        lp += 0.35 * (y - lp);
        line[p] = src[i] + lp * decay;
        out[i] += y * 0.25;
        p = (p + 1) % d;
      }
    }
    let cur = out;
    for (const d of aps) {
      const line = new Float32Array(d);
      let p = 0;
      const next = new Float32Array(cur.length);
      for (let i = 0; i < cur.length; i++) {
        const y = line[p];
        const x = cur[i] + y * 0.5;
        line[p] = x;
        next[i] = y - x * 0.5;
        p = (p + 1) % d;
      }
      cur = next;
    }
    return cur;
  };
  const left = run(mono, tune([29.7, 37.1, 41.1, 43.7]), tune([5, 1.7]));
  const right = run(mono, tune([31.1, 38.9, 42.7, 46.1]), tune([5.3, 1.9]));
  for (let i = 0; i < bus.l.length; i++) {
    bus.l[i] += left[i] * wet;
    bus.r[i] += right[i] * wet;
  }
}

// ---------- WAV + mp3 output ----------
function writeMp3(name, bus, kbps = 192) {
  let bad = 0;
  for (const ch of [bus.l, bus.r])
    for (let i = 0; i < ch.length; i++)
      if (!Number.isFinite(ch[i])) {
        ch[i] = 0;
        bad++;
      }
  if (bad > 0) throw new Error(`${name}: ${bad} non-finite samples, a filter is unstable`);
  let peak = 0;
  for (let i = 0; i < bus.l.length; i++) peak = Math.max(peak, Math.abs(bus.l[i]), Math.abs(bus.r[i]));
  const norm = peak > 0.001 ? 0.72 / peak : 1;
  const pcm = Buffer.alloc(bus.l.length * 4);
  for (let i = 0; i < bus.l.length; i++) {
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(bus.l[i] * norm * 32767))), i * 4);
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(bus.r[i] * norm * 32767))), i * 4 + 2);
  }
  const raw = join(OUT, `${name}.raw`);
  writeFileSync(raw, pcm);
  const res = spawnSync("ffmpeg", [
    "-y", "-v", "error", "-f", "s16le", "-ar", String(SR), "-ac", "2", "-i", raw,
    "-b:a", `${kbps}k`, join(OUT, `${name}.mp3`),
  ]);
  rmSync(raw);
  if (res.status !== 0) throw new Error(`ffmpeg failed for ${name}: ${res.stderr}`);
  console.log(`  ${name}.mp3`);
}

// =====================================================================
// MUSIC
// =====================================================================
function makeMusic() {
  const drums = newBus(TOTAL);
  const music = newBus(TOTAL); // bass, pads, plucks, lead: gets the sidechain pump
  const verbSend = newBus(TOTAL);

  const chords = [
    { root: 48, notes: [60, 64, 67, 72] }, // C
    { root: 43, notes: [55, 59, 62, 67] }, // G
    { root: 45, notes: [57, 60, 64, 69] }, // Am
    { root: 41, notes: [53, 57, 60, 65] }, // F
  ];
  const chordAt = (t) => {
    const bar = Math.floor((t - T0) / (BEAT * 4));
    return chords[((bar % 4) + 4) % 4];
  };

  const kickTimes = [];
  const place = (bus, src, t, g, pan = 0) => mixInto(bus, src, t, g, pan);

  const kK = kick();
  const kC = clap();
  const kHc = hat(false);
  const kHo = hat(true);
  const kS = snare();

  // pads follow the chord bar by bar, all the way through
  for (let t = T0 - 2; t < END_STAB + 0.01; t += BEAT * 4) {
    const c = chordAt(t + 0.01);
    const quiet = t < DROP ? 0.55 : 0.8;
    const p = pad(c.notes.map(mtof), BEAT * 4 + 0.3);
    place(verbSend, p, t, quiet * 0.55);
    place(music, p, t, quiet);
  }

  // intro: sparse plucks, heartbeat-ish hats, then the build into the drop
  for (let k = 0; ; k++) {
    const t = T0 + k * BEAT;
    if (t >= DROP - 0.2) break;
    const c = chordAt(t);
    if (t >= 5.5 && k % 2 === 0) {
      const n = c.notes[(k / 2) % 4] + 12;
      const p = pluck(mtof(n), 0.6);
      place(music, p, t, 0.5, k % 4 === 0 ? -0.3 : 0.3);
      place(verbSend, p, t, 0.5);
    }
    if (t >= 9.5) place(drums, kHc, t + BEAT / 2, 0.12 + 0.05 * ((t - 9.5) / 8));
  }
  // riser + snare roll
  const riser = noiseSweep(4.0, 300, 9000, 0.9, 0.8);
  place(drums, riser, DROP - 4.0, 0.9);
  let step = 0.25;
  let tt = 15.5;
  while (tt < DROP - 0.12) {
    place(drums, kS, tt, 0.25 + 0.5 * ((tt - 15.5) / 2));
    step = Math.max(0.0625, step * 0.9);
    tt += step;
  }

  // main groove
  const leadMotif = [76, 79, 81, 79, 76, 74, 72, 74, 79, 81, 84, 81, 79, 76, 74, 72];
  for (let k = 0; ; k++) {
    const t = T0 + k * BEAT;
    if (t < DROP) continue;
    if (t >= END_STAB - 0.01) break;
    const inPeak = t >= 47 && t < END_STAB;
    const c = chordAt(t);
    const beat = k % 4;
    const bar = Math.floor(k / 4);

    // drums
    place(drums, kK, t, 1);
    kickTimes.push(t);
    if (beat === 1 || beat === 3) place(drums, kC, t, 0.7);
    place(drums, kHc, t, 0.5);
    place(drums, kHo, t + BEAT / 2, 0.45);
    if (t >= 41.5) {
      place(drums, kHc, t + BEAT / 4, 0.28);
      place(drums, kHc, t + BEAT * 0.75, 0.28);
    }
    // crash-like accents on section starts
    if (k % 16 === 0 || Math.abs(t - 47) < 0.01 || Math.abs(t - 58) < 0.01)
      place(drums, noiseSweep(1.4, 5000, 12000, 0.6, 0.5), t - 0.1, 0.7);

    // bass: root on the beat, octave bounce on the off 8th
    place(music, bass(mtof(c.root), BEAT * 0.8), t, 0.9);
    place(music, bass(mtof(c.root + (beat % 2 ? 7 : 12)), BEAT * 0.3), t + BEAT / 2, 0.6);

    // arpeggio on 8ths, wide stereo
    const arp = [0, 1, 2, 3, 2, 1, 2, 1];
    for (const half of [0, 1]) {
      const idx = arp[(beat * 2 + half) % 8];
      const p = pluck(mtof(c.notes[idx] + 12), 0.45);
      const at = t + half * (BEAT / 2);
      place(music, p, at, 0.55, half ? 0.4 : -0.4);
      place(verbSend, p, at, 0.6);
    }

    // lead melody for the reveal and the peak
    if ((t >= DROP && t < 23.5) || inPeak) {
      for (const half of [0, 1]) {
        const note = leadMotif[(beat * 2 + half + (bar % 2) * 8) % 16];
        const l = lead(mtof(note), BEAT * 0.42);
        const at = t + half * (BEAT / 2);
        place(music, l, at, 0.55);
        place(verbSend, l, at, 0.7);
      }
    }
  }

  // reveal accent, offer hit, final stab
  place(drums, boom(1.6, 48), DROP, 0.9);
  place(drums, boom(1.0, 55), 47, 0.55);
  const stab = pad([60, 64, 67, 71, 74, 79].map(mtof), 1.2);
  place(music, stab, END_STAB, 1.1);
  place(verbSend, stab, END_STAB, 1.1);
  place(drums, kK, END_STAB, 1);
  place(drums, noiseSweep(2, 4000, 12000, 0.6, 0.6), END_STAB - 0.05, 0.9);
  for (const [i, n] of [84, 88, 91, 95, 100].entries()) {
    const b = bell(mtof(n), 2.4);
    place(verbSend, b, END_STAB + 0.04 * i, 0.7, i % 2 ? 0.5 : -0.5);
    place(music, b, END_STAB + 0.04 * i, 0.55, i % 2 ? 0.5 : -0.5);
  }

  // sidechain pump: duck the melodic bus on every kick once the drop hits
  const duck = new Float32Array(music.l.length).fill(1);
  for (const kt of kickTimes) {
    const s = Math.floor(kt * SR);
    for (let i = 0; i < 0.3 * SR && s + i < duck.length; i++)
      duck[s + i] = Math.min(duck[s + i], 1 - 0.55 * exp(-(i / SR) / 0.11));
  }
  const master = newBus(TOTAL);
  for (let i = 0; i < master.l.length; i++) {
    master.l[i] = drums.l[i] + music.l[i] * duck[i];
    master.r[i] = drums.r[i] + music.r[i] * duck[i];
  }
  reverb(verbSend, 0.55, 0.82);
  for (let i = 0; i < master.l.length; i++) {
    master.l[i] = Math.tanh((master.l[i] + verbSend.l[i]) * 0.7);
    master.r[i] = Math.tanh((master.r[i] + verbSend.r[i]) * 0.7);
  }
  writeMp3("music", master, 192);
}

// =====================================================================
// SOUND EFFECTS
// =====================================================================
function sfx(name, fn, sec = 1.5, wet = 0) {
  const bus = newBus(sec);
  fn(bus);
  if (wet > 0) {
    const send = newBus(sec);
    for (let i = 0; i < bus.l.length; i++) {
      send.l[i] = bus.l[i];
      send.r[i] = bus.r[i];
    }
    reverb(send, 1, 0.7);
    for (let i = 0; i < bus.l.length; i++) {
      bus.l[i] += send.l[i] * wet;
      bus.r[i] += send.r[i] * wet;
    }
  }
  writeMp3(name, bus, 160);
}

function makeSfx() {
  sfx("impact", (b) => {
    mixInto(b, boom(1.9, 50), 0, 1);
    mixInto(b, noiseSweep(1.2, 8000, 800, 0.7, 0.7), 0, 0.5);
    for (const [i, n] of [72, 79, 84, 91].entries()) mixInto(b, bell(mtof(n), 1.6), 0.02 * i, 0.4, i % 2 ? 0.4 : -0.4);
  }, 2, 0.25);
  sfx("whoosh", (b) => {
    mixInto(b, noiseSweep(0.9, 250, 5200, 1.1, 0.7), 0, 0.9, -0.2);
    mixInto(b, noiseSweep(0.9, 400, 7000, 1.4, 0.4), 0.02, 0.6, 0.3);
  }, 1);
  sfx("swipe", (b) => mixInto(b, noiseSweep(0.4, 900, 6000, 1.3, 0.6), 0, 1), 0.45);
  sfx("pop", (b) => {
    const o = buf(0.18);
    let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      ph += (TAU * (520 + 900 * exp(-t * 45))) / SR;
      o[i] = Math.sin(ph) * exp(-t * 28) * 0.9;
    }
    mixInto(b, o, 0, 1);
  }, 0.2);
  sfx("tick", (b) => {
    const o = buf(0.05);
    for (let i = 0; i < o.length; i++) o[i] = Math.sin(TAU * 2400 * (i / SR)) * exp(-(i / SR) * 140);
    mixInto(b, o, 0, 0.8);
  }, 0.06);
  sfx("tap", (b) => {
    const o = buf(0.14);
    const f = svf();
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      o[i] = Math.sin(TAU * (180 - 60 * t * 6) * t) * exp(-t * 40) * 0.9 + f(noise(), 3000, 0.8).bp * exp(-t * 200) * 0.6;
    }
    mixInto(b, o, 0, 1);
  }, 0.16);
  sfx("mic-on", (b) => {
    for (const [i, n] of [76, 83].entries()) mixInto(b, bell(mtof(n), 0.5, 0.4), i * 0.08, 0.7);
  }, 0.6, 0.15);
  sfx("coin", (b) => {
    mixInto(b, bell(mtof(88), 0.9, 1.3), 0, 0.8);
    mixInto(b, bell(mtof(95), 1.1, 1.3), 0.09, 0.9);
  }, 1.2, 0.15);
  sfx("success", (b) => {
    for (const [i, n] of [72, 76, 79, 84].entries()) mixInto(b, bell(mtof(n), 1.2, 0.9), i * 0.075, 0.7, (i - 1.5) * 0.25);
  }, 1.4, 0.3);
  sfx("notify", (b) => {
    mixInto(b, bell(mtof(86), 0.9, 0.6), 0, 0.7);
    mixInto(b, bell(mtof(91), 1, 0.6), 0.14, 0.7);
  }, 1.2, 0.25);
  sfx("sparkle", (b) => {
    for (let i = 0; i < 12; i++) mixInto(b, bell(mtof(84 + [0, 4, 7, 12, 16, 19][i % 6] + (i > 5 ? 12 : 0)), 0.8, 1.2), i * 0.06, 0.35, i % 2 ? 0.6 : -0.6);
  }, 1.6, 0.4);
  sfx("stamp", (b) => {
    mixInto(b, boom(0.8, 62), 0, 1);
    const o = buf(0.06);
    for (let i = 0; i < o.length; i++) o[i] = noise() * exp(-(i / SR) * 90);
    mixInto(b, o, 0, 0.8);
  }, 0.9, 0.1);
  sfx("confetti", (b) => {
    mixInto(b, noiseSweep(0.35, 3000, 9000, 0.8, 0.8), 0, 0.8);
    for (let i = 0; i < 26; i++) {
      const o = buf(0.05);
      for (let j = 0; j < o.length; j++) o[j] = noise() * exp(-(j / SR) * 120);
      mixInto(b, o, 0.04 + rnd() * 0.7, 0.25 + rnd() * 0.3, rnd() * 2 - 1);
    }
    for (let i = 0; i < 8; i++) mixInto(b, bell(mtof(88 + Math.floor(rnd() * 14)), 0.6, 1.3), 0.1 + rnd() * 0.6, 0.15, rnd() * 2 - 1);
  }, 1.2, 0.2);
  sfx("type", (b) => {
    for (let i = 0; i < 9; i++) {
      const o = buf(0.04);
      for (let j = 0; j < o.length; j++) o[j] = (noise() * 0.6 + Math.sin(TAU * (1800 + rnd() * 600) * (j / SR))) * exp(-(j / SR) * 150);
      mixInto(b, o, i * (0.05 + rnd() * 0.04), 0.4 + rnd() * 0.25, rnd() - 0.5);
    }
  }, 0.8);
  sfx("count", (b) => {
    for (let i = 0; i < 18; i++) {
      const o = buf(0.04);
      for (let j = 0; j < o.length; j++) o[j] = Math.sin(TAU * (1500 + i * 55) * (j / SR)) * exp(-(j / SR) * 130);
      mixInto(b, o, i * 0.05 * (1 + i * 0.02), 0.45 + i * 0.015);
    }
  }, 1.4);
}

console.log("Generating audio…");
makeSfx();
makeMusic();
console.log("Done →", OUT);
