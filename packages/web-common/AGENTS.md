# packages/web-common

## Overview

Browser-only code and data that every Zoption web surface shares: the theme tokens and self-hosted fonts, the cookie consent record and gate, the analytics payload sanitizers, the product release notes, and the Android Beta release snapshot. It holds no React and no routing, so any bundler can consume it.

## Key files

| File                                     | Owns                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`                  | Font faces, the light/dark/coffee theme tokens, and base element rules; import once before any surface CSS |
| `fonts/`                                 | Geist, Geist Mono, and Bricolage Grotesque woff2 files with their licenses; bundlers hash them             |
| `src/consent/`                           | Consent record shape, storage, and the optional-integration gate                                           |
| `src/analytics/sanitize.ts`              | URL and host reducers applied to every analytics event                                                     |
| `src/releases/currentRelease.ts`         | The "What's new" list and `releaseHistory`; update before every release                                    |
| `src/releases/androidRelease.json`       | Build-time fallback for the last shipped Android Beta                                                      |
| `src/releases/androidReleaseMetadata.ts` | Strict parser for the untrusted remote `android/latest.json`                                               |

## Conventions

- Import through the subpath `exports` in `package.json` (`@zoption/web-common/consent-gate`), never a file path.
- `currentRelease.ts` reads `__APP_VERSION__`; every consumer must `define` it from the root `package.json` version.
- Tests live in `tests/` and run as the Vitest `web-common` project.
