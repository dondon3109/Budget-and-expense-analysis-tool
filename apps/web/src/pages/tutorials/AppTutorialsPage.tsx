import { AppShell } from "../../components/layout/AppShell";
import { TutorialsPage } from "./TutorialsPage";

export function AppTutorialsPage() {
  return (
    <AppShell>
      <TutorialsPage inAppShell />
    </AppShell>
  );
}
