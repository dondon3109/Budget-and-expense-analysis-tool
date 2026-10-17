// Workspaces a person can act in: their personal one plus any family they belong to.

import { z } from "zod";

export const workspaceKinds = ["user", "family"] as const;
export const workspaceRoles = ["owner", "member", "viewer"] as const;

/**
 * Names the workspace a request acts in. Absent means the caller's personal workspace; the API
 * checks membership server side and rejects a workspace the caller does not belong to.
 */
export const WORKSPACE_HEADER = "X-Zoption-Workspace";

export const workspaceSummarySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(workspaceKinds),
    name: z.string(),
    role: z.enum(workspaceRoles),
  })
  .strict();

export const workspaceListSchema = z
  .object({ workspaces: z.array(workspaceSummarySchema) })
  .strict();

export type WorkspaceKind = (typeof workspaceKinds)[number];
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceList = z.infer<typeof workspaceListSchema>;
