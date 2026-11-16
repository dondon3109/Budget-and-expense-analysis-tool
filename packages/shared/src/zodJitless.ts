import { z } from "zod";

// Zod compiles a fast object parser with `new Function` and, to learn whether it may, probes
// `new Function("")` as each z.object() is built. The web app and public site CSPs forbid
// 'unsafe-eval', so that probe threw an EvalError and raised a CSP violation on every page
// load. jitless skips the probe and keeps the interpreted parser, which parses identically.
// The barrel imports this module first because the flag is read when a schema is built, and
// a bundler keeps that order only inside this package's chunk, not from an app entry.
z.config({ jitless: true });
