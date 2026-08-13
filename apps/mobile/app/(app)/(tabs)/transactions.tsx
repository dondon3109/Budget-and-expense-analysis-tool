import { EmptyState } from "@/ui/components";
import { Screen } from "@/ui/screen";

export default function TransactionsScreen() {
  return (
    <Screen title="Transactions">
      <EmptyState
        title="No transactions yet"
        description="Additions will be written durably before they appear in this list."
      />
    </Screen>
  );
}
