const TICK_COUNT = 5;
const INTERVAL_COUNT = TICK_COUNT - 1;
const MINIMUM_STEP_MINOR = 100;
const MINOR_UNITS_PER_THOUSAND_PESOS = 100_000;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 0,
});

const compactPesoFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 1,
});

export interface MonthlyTrendAxis {
  ticks: number[];
  domain: [number, number];
  stepMinor: number;
}

function niceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= MINIMUM_STEP_MINOR) {
    return MINIMUM_STEP_MINOR;
  }

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier =
    normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10;

  return Math.max(MINIMUM_STEP_MINOR, multiplier * magnitude);
}

export function createMonthlyTrendAxis(maxMinor: number): MonthlyTrendAxis {
  const safeMaximum = Number.isFinite(maxMinor) ? Math.max(0, maxMinor) : 0;
  const stepMinor = niceStep(safeMaximum / INTERVAL_COUNT);
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => index * stepMinor);

  return {
    ticks,
    domain: [0, INTERVAL_COUNT * stepMinor],
    stepMinor,
  };
}

export function formatMonthlyTrendTick(valueMinor: number, axis: MonthlyTrendAxis): string {
  if (valueMinor === 0) {
    return "₱0";
  }

  if (axis.domain[1] < MINOR_UNITS_PER_THOUSAND_PESOS) {
    return `₱${pesoFormatter.format(valueMinor / 100)}`;
  }

  return `₱${compactPesoFormatter.format(valueMinor / MINOR_UNITS_PER_THOUSAND_PESOS)}k`;
}
