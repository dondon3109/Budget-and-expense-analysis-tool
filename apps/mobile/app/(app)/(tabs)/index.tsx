import { EmptyState } from "@/ui/components";
import { Screen } from "@/ui/screen";

export default function HomeScreen() {
  return (
    <Screen title="Home">
      <EmptyState
        title="Encrypted workspace ready"
        description="Your identity is verified and local storage is protected. Existing records will appear after the first approved sync milestone."
      />
    </Screen>
  );
}
