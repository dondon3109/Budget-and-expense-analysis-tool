// Builds the pet color masks: for every pet picture, a soft mask of its body (fur, skin, or
// feathers) that a chosen pet color tints, leaving cheeks, bellies, eyes, outlines, and outfits
// alone. The output is committed, so run this only after a picture changes, then look at it:
//
//   node scripts/generate-pet-masks.mjs
//
// It writes 256px WebPs (white, with the mask in alpha) to apps/web/public/pet/masks/ and
// apps/mobile/assets/pet/masks/, plus the mobile import map apps/mobile/src/features/pet/pet-masks.ts.
// The tint itself lives in packages/shared/src/petColor.ts.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

const SOURCE_DIR = "apps/web/public/pet";
const OUTPUT_DIRS = ["apps/web/public/pet/masks", "apps/mobile/assets/pet/masks"];
const MOBILE_MAP = "apps/mobile/src/features/pet/pet-masks.ts";
const MASK_SIZE = 256;

const SPECIES = ["hedgehog", "pig", "hamster", "penguin", "panda", "hippo"];
const STAGES = ["baby", "juvenile", "adult", "legend"];
const LOOKS = ["healthy", "blink", "sick", "fading"];

/** 1 inside [lo, hi], ramping to 0 over `soft` on either side. */
const band = (x, lo, hi, soft) =>
  Math.min(1, Math.max(0, Math.min((x - lo) / soft, (hi - x) / soft) + 1));
/** A hue band that may wrap past 0 (lo below 0). */
const hueBand = (h, lo, hi, soft) => Math.max(band(h, lo, hi, soft), band(h - 360, lo, hi, soft));

// Which pixels are body, by hue (degrees), lightness, and saturation (HSL, 0..1). Sick and fading
// pictures are paler and greyer, so they get their own bands. Tuned by eye against every picture.
const healthyRules = {
  hedgehog: (h, l, s) =>
    hueBand(h, -10, 45, 8) * band(l, 0.24, 0.6, 0.05) * band(s, 0.08, 0.45, 0.06),
  pig: (h, l, s) => hueBand(h, -12, 35, 8) * band(l, 0.42, 0.8, 0.05) * band(s, 0.1, 0.45, 0.06),
  hamster: (h, l, s) => hueBand(h, 12, 42, 6) * band(l, 0.33, 0.78, 0.05) * band(s, 0.55, 1, 0.08),
  penguin: (h, l, s) =>
    hueBand(h, 170, 280, 15) * band(l, 0.08, 0.45, 0.05) * band(s, 0, 0.32, 0.06),
  panda: (_h, l, s) => band(l, 0, 0.38, 0.05) * band(s, 0, 0.22, 0.06),
  hippo: (h, l, s) =>
    hueBand(h, 235, 315, 12) * band(l, 0.42, 0.88, 0.05) * band(s, 0.06, 0.4, 0.05),
};
const paleRules = {
  // A light, saturated pixel is the cream belly, not faded spines.
  hedgehog: (h, l, s) =>
    hueBand(h, -10, 50, 8) *
    band(l, 0.24, 0.78, 0.04) *
    band(s, 0.02, 0.45, 0.04) *
    (1 - band(l, 0.62, 1, 0.04) * band(s, 0.22, 1, 0.04)),
  pig: (h, l, s) => hueBand(h, -12, 35, 8) * band(l, 0.42, 0.82, 0.04) * band(s, 0.06, 0.45, 0.05),
  hamster: (h, l, s) => hueBand(h, 12, 48, 6) * band(l, 0.33, 0.84, 0.03) * band(s, 0.36, 1, 0.06),
  penguin: (h, l, s) =>
    hueBand(h, 170, 280, 15) * band(l, 0.08, 0.78, 0.04) * band(s, 0, 0.35, 0.06),
  panda: (_h, l, s) => band(l, 0, 0.72, 0.04) * band(s, 0, 0.2, 0.05),
  hippo: (h, l, s) =>
    hueBand(h, 225, 315, 12) * band(l, 0.42, 0.95, 0.03) * band(s, 0.03, 0.4, 0.04),
};

function hsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, l, 0];
  const s = l < 0.5 ? d / (max + min) : d / (2 - max - min);
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, l, s];
}

/** The picture file and mask name for one look: `hedgehog-baby-sick`, `pig-egg`, and so on. */
function pictures() {
  const names = [];
  for (const species of SPECIES) {
    names.push({ species, name: `${species}-egg`, pale: false });
    for (const stage of STAGES) {
      for (const look of LOOKS) {
        const suffix = look === "healthy" ? "" : `-${look}`;
        names.push({
          species,
          name: `${species}-${stage}${suffix}`,
          pale: look === "sick" || look === "fading",
        });
      }
    }
  }
  return names;
}

async function buildMask({ species, name, pale }) {
  const rule = (pale ? paleRules : healthyRules)[species];
  const { data, info } = await sharp(join(SOURCE_DIR, `${name}.webp`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    const [h, l, s] = hsl(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255);
    mask[pixel] = Math.round(rule(h, l, s) * 255);
  }
  // Soften the edges a little so the tint meets the outline without a seam.
  const alpha = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
    .blur(0.7)
    .resize(MASK_SIZE, MASK_SIZE)
    // sharp widens a one-channel raw input to sRGB; keep the single mask channel.
    .extractChannel(0)
    .raw()
    .toBuffer();
  return sharp({
    create: { width: MASK_SIZE, height: MASK_SIZE, channels: 3, background: "#ffffff" },
  })
    .joinChannel(alpha, { raw: { width: MASK_SIZE, height: MASK_SIZE, channels: 1 } })
    .webp({ lossless: true })
    .toBuffer();
}

const camel = (name) => name.replace(/-(\w)/g, (_match, letter) => letter.toUpperCase());

function mobileMap(list) {
  const imports = list.map(
    ({ name }) => `import ${camel(name)}Mask from "../../../assets/pet/masks/${name}.webp";`,
  );
  const entries = list.map(({ name }) => `  "${name}": ${camel(name)}Mask,`);
  return [
    "// Generated by scripts/generate-pet-masks.mjs; do not edit by hand.",
    ...imports,
    "",
    "/** Each pet picture's body mask, by picture name (`hedgehog-baby-sick`). */",
    "export const petMasks: Record<string, number> = {",
    ...entries,
    "};",
    "",
  ].join("\n");
}

const list = pictures();
for (const dir of OUTPUT_DIRS) mkdirSync(dir, { recursive: true });
for (const picture of list) {
  const mask = await buildMask(picture);
  for (const dir of OUTPUT_DIRS) writeFileSync(join(dir, `${picture.name}.webp`), mask);
}
writeFileSync(MOBILE_MAP, mobileMap(list));
execFileSync("pnpm", ["exec", "prettier", "--write", MOBILE_MAP], {
  stdio: "inherit",
});
console.log(`Wrote ${list.length} masks to ${OUTPUT_DIRS.join(" and ")}.`);
