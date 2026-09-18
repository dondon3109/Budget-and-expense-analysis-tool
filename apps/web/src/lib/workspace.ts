import type { User } from "@supabase/supabase-js";

export interface AuthenticatedWorkspace {
  key: `user:${string}`;
  userId: string;
}

// One account has one workspace object: callers use it in dependency arrays to mean
// "this account", so handing back a fresh object every call would re-run their effects on
// every render. The cache is a single slot because only one account is signed in at a time.
let cachedWorkspace: AuthenticatedWorkspace | undefined;

export function userWorkspace(user: User): AuthenticatedWorkspace {
  const key: `user:${string}` = `user:${user.id}`;
  if (cachedWorkspace?.key !== key) {
    cachedWorkspace = { key, userId: user.id };
  }
  return cachedWorkspace;
}
