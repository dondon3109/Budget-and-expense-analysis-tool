import { Stack } from "expo-router";

import { Screen } from "@/ui/screen";

import { useActiveWorkspace } from "./active-workspace";
import { FamilyDirectoryView } from "./FamilyDirectoryView";
import { FamilyManagerView } from "./FamilyManagerView";

/** In a family, its members and settings; in personal, invitations and the person's families. */
export function FamilyScreen() {
  const family = useActiveWorkspace().family;
  // Matches the Home workspace menu: settings inside a family, the family workspace from personal.
  const title = family ? "Family settings" : "Family workspace";
  return (
    <Screen hasHeader title={title}>
      <Stack.Screen options={{ title }} />
      {family ? <FamilyManagerView /> : <FamilyDirectoryView />}
    </Screen>
  );
}
