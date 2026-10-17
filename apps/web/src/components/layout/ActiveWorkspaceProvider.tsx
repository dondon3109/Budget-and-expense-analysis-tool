import type { User } from "@supabase/supabase-js";
import type { WorkspaceSummary } from "@zoption/shared";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { familyWorkspace, userWorkspace, type AuthenticatedWorkspace } from "../../lib/workspace";
import { useWorkspaces } from "../../queries/families";

export interface ActiveWorkspace {
  /** The person's own workspace; person-level calls (billing, invitations) always use it. */
  personal: AuthenticatedWorkspace;
  /** Where the family-capable pages read and write: the active family, or `personal`. */
  workspace: AuthenticatedWorkspace;
  /** The active family, or undefined while the person is in their own workspace. */
  family?: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  familiesAvailable: boolean;
  /** A family id, or null for the personal workspace. */
  switchTo: (familyId: string | null) => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspace | null>(null);

function storageKey(userId: string): string {
  return `zoption-active-workspace:${userId}`;
}

function readStoredFamily(userId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

/**
 * Remembers the last workspace this person used in this browser and opens to it. A remembered
 * family counts only while the workspace list still includes it, so leaving or being removed
 * falls back to the personal workspace without a forbidden request.
 */
export function ActiveWorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const personal = userWorkspace(user);
  const list = useWorkspaces(personal);
  const [storedFamilyId, setStoredFamilyId] = useState(() => readStoredFamily(user.id));

  const workspaces = list.data?.workspaces;
  const family = workspaces?.find(
    (workspace) => workspace.kind === "family" && workspace.id === storedFamilyId,
  );
  const value = useMemo<ActiveWorkspace>(
    () => ({
      personal,
      workspace: family ? familyWorkspace(user, family.id) : personal,
      family,
      workspaces: workspaces ?? [],
      familiesAvailable: list.data?.familiesAvailable ?? false,
      switchTo: (familyId) => {
        try {
          if (familyId) window.localStorage.setItem(storageKey(user.id), familyId);
          else window.localStorage.removeItem(storageKey(user.id));
        } catch {
          // Without storage the choice still holds for this visit.
        }
        setStoredFamilyId(familyId);
      },
    }),
    [personal, family, workspaces, list.data?.familiesAvailable, user],
  );

  // Opening to a remembered family waits for the list rather than flashing the personal one.
  if (storedFamilyId && list.isPending) return null;
  return (
    <ActiveWorkspaceContext.Provider value={value}>{children}</ActiveWorkspaceContext.Provider>
  );
}

/** Outside the provider (tests, pages rendered alone) this is the personal workspace. */
export function useActiveWorkspace(): ActiveWorkspace {
  const context = useContext(ActiveWorkspaceContext);
  const { user } = useAuth();
  if (context) return context;
  const personal = userWorkspace(user!);
  return {
    personal,
    workspace: personal,
    workspaces: [],
    familiesAvailable: false,
    switchTo: () => undefined,
  };
}
