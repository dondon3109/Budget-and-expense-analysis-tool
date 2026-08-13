# Zoption vertical ads

Local, code-based 9:16 ad templates built with Remotion. The package renders 1080×1920 H.264 MP4
files for TikTok and Instagram Reels. It does not call any paid media-generation service.

## Included compositions

| Composition ID                | Length | Concept                                                      | Output                        |
| ----------------------------- | -----: | ------------------------------------------------------------ | ----------------------------- |
| `Zoption-Feature-Highlight`   |    13s | Hook, monthly overview, three feature callouts, CTA          | `out/feature-highlight.mp4`   |
| `Zoption-Problem-To-Solution` |    15s | Scattered spending, Zoption reveal, three-step solution, CTA | `out/problem-to-solution.mp4` |
| `Zoption-Product-Showcase`    |    12s | Logo intro, assistant/product reveal, feature callouts, CTA  | `out/product-showcase.mp4`    |

All three compositions use a 30fps timeline and keep important copy inside a social-safe frame so
platform controls are less likely to cover it. The templates are intentionally sound-off friendly.

## Preview in Remotion Studio

From the repository root:

```bash
pnpm ads:studio
```

Or from this directory:

```bash
pnpm studio
```

## Render videos

From the repository root:

```bash
pnpm ads:render:feature
pnpm ads:render:problem
pnpm ads:render:showcase
pnpm ads:render:all
```

Rendered files are written to `apps/ads/out/`. That directory is intentionally ignored by Git.
Remotion handles the H.264 encode locally. A system FFmpeg install is not required for the standard
commands.

To render three representative PNG frames instead of full videos:

```bash
pnpm --filter @zoption/ads still:all
```

## Edit copy, colors, timing, and CTAs

Edit [`src/config/adData.ts`](src/config/adData.ts). Each composition has one typed config object
containing:

- `headline`, `subtext`, and `eyebrow`
- `cta` and `url`
- the three template-specific feature lines
- `durationSeconds`
- the full color theme
- the optional product screenshot settings

Keep the composition duration and scene timing aligned when making large duration changes. The
composition timelines live in [`src/compositions`](src/compositions).

## Swap in real product screenshots

The checked-in templates default to responsive, code-drawn Zoption UI with clearly labeled
illustrative values. This keeps the project reproducible and prevents personal financial data from
entering the repo.

To use a real screenshot:

1. Capture a clean demo workspace with non-sensitive data.
2. Put the image in `public/screenshots/`.
3. Set `asset.src` in the chosen config, such as `"screenshots/dashboard.png"`.
4. Adjust `fit` and `position` if the crop needs refinement.

The expected config shape is documented in [`public/screenshots/README.md`](public/screenshots/README.md).
If `asset.src` is omitted, the template uses the built-in product preview.

## Structure

```text
apps/ads/
├── public/screenshots/       # Optional local product captures
├── src/components/           # Brand, layout, CTA, and product-preview primitives
├── src/compositions/         # Three independent ad timelines
├── src/config/               # Typed ad content and visual settings
├── src/Root.tsx              # Composition registration and dimensions
├── src/styles.css            # Shared 9:16 art direction
└── remotion.config.ts        # Local H.264 render defaults
```

## Optional FFmpeg finishing

The normal Remotion outputs are already suitable H.264 MP4 files. If a platform or editor requires
another delivery copy, use a local FFmpeg install after rendering. For example, this keeps the
vertical size and makes the file stream-friendly:

```bash
ffmpeg -i out/feature-highlight.mp4 -c:v libx264 -pix_fmt yuv420p -movflags +faststart -an out/feature-highlight-social.mp4
```

No music is bundled. Add only audio you own or are licensed to use, and keep the on-screen copy
because many short-form views begin muted.
