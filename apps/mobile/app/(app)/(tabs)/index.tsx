import { EmptyState } from "@/ui/components";
import { Screen } from "@/ui/screen";

export default function HomeScreen() {
  return (
    <Screen title="Home">
      <EmptyState
        title="No local records yet"
        description="Your encrypted workspace will appear here after the first authenticated sync."
      />
    </Screen>
  );
}
