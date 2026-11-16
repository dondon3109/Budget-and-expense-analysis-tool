import { router } from "expo-router";

/** Opens Bills in the Budgets tab. `highlight` is the bill an idle-bill nudge points at. */
export function openBills(highlight?: string): void {
  router.push({
    pathname: "/(app)/(tabs)/budgets",
    params: highlight ? { view: "bills", highlight } : { view: "bills" },
  });
}
