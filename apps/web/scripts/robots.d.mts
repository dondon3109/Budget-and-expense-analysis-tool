/**
 * Hand-written types for `robots.mjs`.
 *
 * The build scripts are plain ESM outside the TS project, so `tsc` cannot infer
 * anything from them. `tests/robots.test.ts` imports this module to guard the
 * generated crawler policy, and typecheck runs in CI.
 */
export declare function robotsText(siteOrigin: string, indexingEnabled: boolean): string;
