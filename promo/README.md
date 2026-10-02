# Zoption promo video

A 63.5s vertical (1080×1920, 30 fps) TikTok/Reels ad built with [Remotion](https://remotion.dev) and
three.js. It is a standalone project: it has its own `package-lock.json` and is not part of the pnpm
workspace, so `pnpm verify` does not touch it.

Your hook/problem clip is `public/scene1/Zoption-video.mp4` (17.5s). The six voiceover clips are in
`public/voiceover/`. Everything after the first clip is generated: the scenes are React, the 3D is
three.js, and the music and sound effects are synthesised by `scripts/make-audio.mjs` (no licensed audio).

## Run it

```bash
cd promo
npm install
npm run audio          # music + sound effects -> public/audio/*.mp3 (needs ffmpeg)
node scripts/analyze-voice.mjs   # voice loudness per frame -> src/voiceEnvelope.json (needs ffmpeg)
npm run studio         # live preview
npm run render         # out/zoption-promo.mp4
```

On a machine without a GPU (CI, a cloud container) render with software GL and the headless-shell
browser, because full Chromium no longer supports the old headless mode Remotion uses:

```bash
CHROME_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
  npx remotion render src/index.ts ZoptionPromo out/zoption-promo.mp4 --gl=swangle --concurrency=3
```

`node scripts/stills.mjs 560 900 1500` renders those frames to `out/stills/` for a quick look (add
`--full` for full size).

## Retiming

`src/timing.ts` is the single source of truth:

- `SCENES`: start and length of each scene, in frames. Cuts sit on the music's beat grid (120 BPM, a
  beat is 15 frames), so keep lengths in multiples of 15 or move `MUSIC.firstBeat` in
  `scripts/make-audio.mjs` with them.
- `VOICE`: the spoken phrases of each clip with start/end seconds inside the clip. Captions and
  on-screen cues hang off these. They came from the pauses in the recordings (`ffmpeg silencedetect`).
  If you re-record a clip, re-measure its pauses and update the segments.
- `SFX`: every sound effect with an absolute time in seconds.

After replacing a voiceover clip, re-run `scripts/analyze-voice.mjs` so the on-screen waveform follows
the new recording.

## Layout

| Path                                  | What                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `src/Promo.tsx`                       | Composition: 3D layer, intro clip, scenes, wipes, grain, audio        |
| `src/scenes/`                         | Reveal, Demo1 (mic widget), Demo2 (AI chat), Demo3, Offer, Cta        |
| `src/three/`                          | Logo coin, 3D donut, Pro badge, particles, camera rig (`World.tsx`)   |
| `src/ui/`                             | Phone mockup, captions, wipes, icons, fonts                           |
| `src/AudioLayer.tsx`                  | Voice, music with ducking under speech, sound effects                 |
| `scripts/make-audio.mjs`              | Music and sound-effect synthesiser                                    |

Colours and fonts come from the product's dark theme tokens (`packages/web-common/src/styles/tokens.css`)
and the logo SVG, via `src/theme.ts`.
