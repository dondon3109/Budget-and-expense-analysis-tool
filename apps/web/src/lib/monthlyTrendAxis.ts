const TICK_COUNT = 5;
const INTERVAL_COUNT = TICK_COUNT - 1;
const DEFAULT_MAXIMUM_MINOR = 1_000_000;
const pesoFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 0,
});

export interface MonthlyTrendAxis {
  ticks: number[];
  domain: [number, number];
  stepMinor: number;
}

function niceStep(roughStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;

  return multiplier * magnitude;
}

export function createMonthlyTrendAxis(maxMinor: number): MonthlyTrendAxis {
  const safeMaximum = Number.isFinite(maxMinor) ? Math.max(0, maxMinor) : 0;
  const maximumForAxis = Math.max(DEFAULT_MAXIMUM_MINOR, safeMaximum);
  const stepMinor =
    maximumForAxis === DEFAULT_MAXIMUM_MINOR
      ? DEFAULT_MAXIMUM_MINOR / INTERVAL_COUNT
      : niceStep(maximumForAxis / INTERVAL_COUNT);
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => index * stepMinor);

  return {
    ticks,
    domain: [0, INTERVAL_COUNT * stepMinor],
    stepMinor,
  };
}

export function formatMonthlyTrendTick(valueMinor: number): string {
  return `₱${pesoFormatter.format(valueMinor / 100)}`;
}
