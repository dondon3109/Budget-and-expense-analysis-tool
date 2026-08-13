import type { LocalWorkspaceSignOutRisk } from "@/db/workspace";

export class UnsyncedChangesError extends Error {
  constructor(readonly risk: LocalWorkspaceSignOutRisk) {
    super(
      "This workspace has changes that have not been acknowledged by Zoption. Confirm that you want to discard them before signing out.",
    );
    this.name = "UnsyncedChangesError";
  }
}

export function assertSignOutRiskAllowed(
  risk: LocalWorkspaceSignOutRisk,
  discardUnsyncedChanges: boolean,
): void {
  if (
    !discardUnsyncedChanges &&
    (risk.unsyncedOperationCount > 0 || risk.unresolvedConflictCount > 0)
  ) {
    throw new UnsyncedChangesError(risk);
  }
}
