// The public site only ever shows pesos. Same locale and rounding as the app's PHP display.
const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/** Whole-peso display of integer centavos. */
export function formatPeso(amountMinor: number): string {
  return pesoFormatter.format(amountMinor / 100);
}
