import { FamilyDirectory } from "../components/family/FamilyDirectory";
import { FamilyManager } from "../components/family/FamilyManager";
import { useActiveWorkspace } from "../components/layout/ActiveWorkspaceProvider";
import { AppShell } from "../components/layout/AppShell";
import "./FamilyPage.css";

/** Manages the active family, or, in the personal workspace, lists and creates families. */
export function FamilyPage() {
  const { family } = useActiveWorkspace();
  return (
    <AppShell>
      <div className="dashboard-page family-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Family</p>
            <h1>{family ? family.name : "Families"}</h1>
          </div>
        </header>
        {family ? <FamilyManager family={family} /> : <FamilyDirectory />}
      </div>
    </AppShell>
  );
}
