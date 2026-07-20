import type { User } from "@supabase/supabase-js";

export interface DemoWorkspace {
  mode: "demo";
  key: "demo";
}

export interface AuthenticatedWorkspace {
  mode: "user";
  key: `user:${string}`;
  userId: string;
}

export type Workspace = DemoWorkspace | AuthenticatedWorkspace;
export type WorkspaceMode = Workspace["mode"];

export const demoWorkspace: DemoWorkspace = { mode: "demo", key: "demo" };

export function userWorkspace(user: User): AuthenticatedWorkspace {
  return { mode: "user", key: `user:${user.id}`, userId: user.id };
}
