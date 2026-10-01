// Fast visual check: renders a list of frames to out/stills/ at half size.
// Usage: CHROME_PATH=... node scripts/stills.mjs 560 700 900 [--full]
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const full = args.includes("--full");
const frames = args.filter((a) => /^\d+$/.test(a)).map(Number);
mkdirSync(join(root, "out", "stills"), { recursive: true });

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts"), publicDir: join(root, "public") });
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.CHROME_PATH,
  chromiumOptions: { gl: "swangle" },
});
const composition = await selectComposition({ serveUrl, id: "ZoptionPromo", puppeteerInstance: browser });
for (const frame of frames) {
  const t = Date.now();
  await renderStill({
    composition,
    serveUrl,
    frame,
    output: join(root, "out", "stills", `f${String(frame).padStart(4, "0")}.png`),
    puppeteerInstance: browser,
    scale: full ? 1 : 0.5,
    chromiumOptions: { gl: "swangle" },
    timeoutInMilliseconds: 120000,
  });
  console.log(`frame ${frame} ${(Date.now() - t) / 1000}s`);
}
await browser.close({ silent: true });
