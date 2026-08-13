import { EmptyState } from "@/ui/components";
import { Screen } from "@/ui/screen";

export default function BudgetsScreen() {
  return (
    <Screen title="Budgets">
      <EmptyState
        title="No monthly budget yet"
        description="Budget limits and actual spending will use the same server-authoritative semantics as Zoption web."
      />
    </Screen>
  );
}
