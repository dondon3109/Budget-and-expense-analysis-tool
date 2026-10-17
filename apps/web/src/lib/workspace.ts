import type { User } from "@supabase/supabase-js";

export interface AuthenticatedWorkspace {
  key: `user:${string}` | `family:${string}`;
  userId: string;
  /** Set when requests act in a family; the transport sends it as the workspace header. */
  familyId?: string;
}

// One account (or account in one family) maps to one workspace object: callers use it in
// dependency arrays to mean "this workspace", so returning a fresh object on every call would
// re-run their effects on every render. Keyed by the inputs that determine the value.
const workspacesByKey = new Map<string, AuthenticatedWorkspace>();

function remembered(workspace: AuthenticatedWorkspace): AuthenticatedWorkspace {
  const existing = workspacesByKey.get(workspace.key);
  if (existing) return existing;
  workspacesByKey.set(workspace.key, workspace);
  return workspace;
}

export function userWorkspace(user: User): AuthenticatedWorkspace {
  return remembered({ key: `user:${user.id}`, userId: user.id });
}

/** `familyId` is the family's tenant id (`family:<uuid>`), so the key stays per person too. */
export function familyWorkspace(user: User, familyId: string): AuthenticatedWorkspace {
  const key: `family:${string}` = `family:${familyId}:${user.id}`;
  return remembered({ key, userId: user.id, familyId });
}

/** The person's own workspace behind any workspace, for calls that belong to the person. */
export function personalWorkspace(workspace: AuthenticatedWorkspace): AuthenticatedWorkspace {
  return remembered({ key: `user:${workspace.userId}`, userId: workspace.userId });
}
