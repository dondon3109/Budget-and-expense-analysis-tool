import { router, useLocalSearchParams } from "expo-router";

import { SubscriptionsScreen } from "@/features/subscriptions/SubscriptionsScreen";
import { ViewSwitch } from "@/ui/components";
import { BudgetsScreen } from "./BudgetsScreen";

const PLAN_VIEWS = [
  { value: "budgets", label: "Budgets" },
  { value: "bills", label: "Bills" },
] as const;

/**
 * The Budgets tab: monthly budgets or bills, switched like Home's Overview and Analytics. The
 * view lives in the `view` param, so a link can open Bills directly and the switch never mirrors
 * it in state.
 */
export function BudgetsTab() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const selected = view === "bills" ? "bills" : "budgets";
  const viewSwitch = (
    <ViewSwitch
      onSelect={(next) => router.setParams({ view: next })}
      options={PLAN_VIEWS}
      selected={selected}
    />
  );
  if (selected === "bills") return <SubscriptionsScreen viewSwitch={viewSwitch} />;
  return <BudgetsScreen viewSwitch={viewSwitch} />;
}
