export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const;

export type ProductAsset = {
  /** Path relative to apps/ads/public. Leave undefined to use the built-in illustrative UI. */
  src?: string;
  alt: string;
  fit: "contain" | "cover";
  position: string;
};

export type AdTheme = {
  background: string;
  ink: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  paper: string;
  muted: string;
};

export type BaseAdConfig = {
  durationSeconds: number;
  eyebrow: string;
  headline: string;
  subtext: string;
  cta: string;
  url: string;
  asset: ProductAsset;
  theme: AdTheme;
};

export type FeatureHighlightConfig = BaseAdConfig & {
  featureLabels: readonly [string, string, string];
};

export type ProblemSolutionConfig = BaseAdConfig & {
  problemLines: readonly [string, string, string];
  solutionSteps: readonly [string, string, string];
};

export type ProductShowcaseConfig = BaseAdConfig & {
  callouts: readonly [string, string, string];
};
