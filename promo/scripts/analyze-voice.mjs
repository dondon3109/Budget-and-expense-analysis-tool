// Measures the loudness of every voiceover clip once per video frame and writes
// src/voiceEnvelope.json, so on-screen waveforms move with the real recording.
// Needs ffmpeg on PATH. Re-run after replacing a clip.
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "voiceover");
const FPS = 30;
const SR = 16000;

const out = {};
for (const file of readdirSync(dir).filter((n) => n.endsWith(".m4a"))) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", join(dir, file), "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], {
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${file}`);
  const samples = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4));
  const levels = [];
  const frames = Math.floor((samples.length / SR) * FPS);
  for (let k = 0; k < frames; k++) {
    const a = Math.round((k * SR) / FPS);
    const b = Math.round(((k + 1) * SR) / FPS);
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j] ** 2;
    levels.push(Math.sqrt(sum / (b - a)));
  }
  const peak = Math.max(...levels, 1e-6);
  out[file] = levels.map((v) => Math.round((v / peak) * 100) / 100);
}
writeFileSync(join(root, "src", "voiceEnvelope.json"), JSON.stringify(out));
console.log("voiceEnvelope.json:", Object.entries(out).map(([k, v]) => `${k} ${v.length}f`).join(", "));
