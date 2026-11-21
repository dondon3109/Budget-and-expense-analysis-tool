import { router, useLocalSearchParams } from "expo-router";
import { useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { LocalQueryActivity } from "@/db/local-workspace-state";
import { SubscriptionsScreen } from "@/features/subscriptions/SubscriptionsScreen";
import { ViewSwitch } from "@/ui/components";
import { BudgetsScreen } from "./BudgetsScreen";

const PLAN_VIEWS = [
  { value: "budgets", label: "Budgets" },
  { value: "bills", label: "Bills" },
] as const;

type PlanView = (typeof PLAN_VIEWS)[number]["value"];

/**
 * The Budgets tab: monthly budgets or bills, switched like Home's Overview and Analytics. The
 * view lives in the `view` param, so a link can open Bills directly and the switch never mirrors
 * it in state. A view stays mounted once opened and is only hidden, because remounting it
 * reloaded its local data and flashed its loading skeleton on every switch.
 */
export function BudgetsTab() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const selected: PlanView = view === "bills" ? "bills" : "budgets";
  const opened = useRef(new Set<PlanView>()).current;
  opened.add(selected);
  const viewSwitch = (
    <ViewSwitch
      onSelect={(next) => router.setParams({ view: next })}
      options={PLAN_VIEWS}
      selected={selected}
    />
  );
  return (
    <View style={styles.fill}>
      {opened.has("budgets") ? (
        <PlanViewPane active={selected === "budgets"}>
          <BudgetsScreen viewSwitch={viewSwitch} />
        </PlanViewPane>
      ) : null}
      {opened.has("bills") ? (
        <PlanViewPane active={selected === "bills"}>
          <SubscriptionsScreen viewSwitch={viewSwitch} />
        </PlanViewPane>
      ) : null}
    </View>
  );
}

function PlanViewPane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <LocalQueryActivity active={active}>
      <View
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? "auto" : "no-hide-descendants"}
        style={[styles.fill, !active && styles.hidden]}
      >
        {children}
      </View>
    </LocalQueryActivity>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: "none" },
});
