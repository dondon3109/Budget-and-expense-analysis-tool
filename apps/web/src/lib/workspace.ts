import type { User } from "@supabase/supabase-js";

export interface AuthenticatedWorkspace {
  key: `user:${string}`;
  userId: string;
}

// One account maps to one workspace object: callers use it in dependency arrays to mean
// "this account", so returning a fresh object on every call would re-run their effects on
// every render. Keyed by account because the id is the only input that determines the value.
const workspacesByUser = new Map<string, AuthenticatedWorkspace>();

export function userWorkspace(user: User): AuthenticatedWorkspace {
  const key: `user:${string}` = `user:${user.id}`;
  let workspace = workspacesByUser.get(key);
  if (!workspace) {
    workspace = { key, userId: user.id };
    workspacesByUser.set(key, workspace);
  }
  return workspace;
}
