import type { User } from "@supabase/supabase-js";

export interface AuthenticatedWorkspace {
  key: `user:${string}`;
  userId: string;
}

export function userWorkspace(user: User): AuthenticatedWorkspace {
  return { key: `user:${user.id}`, userId: user.id };
}
