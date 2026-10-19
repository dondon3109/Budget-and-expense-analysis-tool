import { Stack } from "expo-router";

import { Screen } from "@/ui/screen";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyDirectoryView } from "./FamilyDirectoryView";
import { FamilyManagerView } from "./FamilyManagerView";

/** In a family, its members and settings; in personal, invitations and the person's families. */
export function FamilyScreen() {
  const family = useActiveWorkspace().family;
  return (
    <Screen showHeading={false} title={family?.name ?? "Families"}>
      <Stack.Screen options={{ title: family?.name ?? "Families" }} />
      {family ? <FamilyManagerView /> : <FamilyDirectoryView />}
    </Screen>
  );
}
