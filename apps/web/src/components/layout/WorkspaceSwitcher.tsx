import type { WorkspaceSummary } from "@zoption/shared";
import { Users } from "lucide-react";
import type { ChangeEvent } from "react";

import { ROLE_LABELS } from "../family/familyLabels";
import "./WorkspaceSwitcher.css";

/**
 * Picks the workspace the family-capable pages act in. Shown only once the person belongs to a
 * family; the personal workspace is always the first option.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeFamilyId,
  onSwitch,
}: {
  workspaces: WorkspaceSummary[];
  activeFamilyId?: string;
  onSwitch: (familyId: string | null, opener: HTMLElement) => void;
}) {
  const families = workspaces.filter((workspace) => workspace.kind === "family");
  if (families.length === 0) return null;
  return (
    <label className="workspace-switcher">
      <span>Workspace</span>
      <select
        value={activeFamilyId ?? ""}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onSwitch(event.target.value || null, event.currentTarget)
        }
      >
        <option value="">Personal</option>
        {families.map((family) => (
          <option key={family.id} value={family.id}>
            {family.name} · {ROLE_LABELS[family.role]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Keeps the active family obvious above every page while one is open. */
export function FamilyWorkspaceBanner({
  family,
  onLeave,
}: {
  family: WorkspaceSummary;
  onLeave: (opener: HTMLElement) => void;
}) {
  return (
    <div className="family-workspace-banner" role="status">
      <Users size={16} aria-hidden="true" />
      <span>
        <strong>{family.name}</strong> · {ROLE_LABELS[family.role]}
      </span>
      <button
        type="button"
        className="button secondary compact"
        onClick={(event) => onLeave(event.currentTarget)}
      >
        Back to personal
      </button>
    </div>
  );
}

/** For a page that does not work in a family yet, instead of showing personal data there. */
export function FamilyUnsupportedNotice({ onLeave }: { onLeave: (opener: HTMLElement) => void }) {
  return (
    <section className="family-unsupported" aria-labelledby="family-unsupported-title">
      <h1 id="family-unsupported-title">Not in a family yet</h1>
      <p>This page works in your personal workspace only for now.</p>
      <button
        type="button"
        className="button primary"
        onClick={(event) => onLeave(event.currentTarget)}
      >
        Switch to personal
      </button>
    </section>
  );
}
