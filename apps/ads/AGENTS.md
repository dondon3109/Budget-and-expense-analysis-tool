# apps/ads

## Overview

The Remotion renderer for Zoption marketing videos. It is frozen until a campaign needs it, sits outside the production release path, and no CI workflow builds it. `apps/ads/README.md` carries the render details.

## Stack

- **Language / Runtime**: TypeScript, Remotion 4
- **Output**: h264 mp4 at 1080x1920, rendered into the gitignored `out/`

## Key files

| File                   | Owns                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| `src/index.ts`         | `registerRoot` entry                                                  |
| `src/Root.tsx`         | The four compositions and their durations                             |
| `src/compositions/`    | The video scenes                                                      |
| `src/config/adData.ts` | Copy and per composition duration; the only place to change durations |

## Commands

```bash
pnpm ads:studio
pnpm ads:render:all
pnpm --filter @zoption/ads typecheck
```

## Conventions

- Composition length derives from `config.durationSeconds` at 30 fps. Change durations in `src/config/adData.ts` only.
- Never commit rendered output under `out/`.
- On screen product claims are marketing copy. Refresh them against the current product before a campaign.

## Gotchas

- `apps/ads` has no build script and no CI workflow, so `pnpm -r build` skips it while `pnpm -r typecheck` still covers it.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
