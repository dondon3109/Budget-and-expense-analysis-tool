import { router } from "expo-router";

import { Button, ErrorState } from "@/ui/components";
import { Screen } from "@/ui/screen";

export default function NotFoundScreen() {
  return (
    <Screen title="Page not found">
      <ErrorState
        title="This route is unavailable"
        message="Return to Zoption and choose another destination."
      />
      <Button onPress={() => router.replace("/(public)")}>Return home</Button>
    </Screen>
  );
}
