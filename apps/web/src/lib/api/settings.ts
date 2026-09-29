import { workspaceSettingsSchema, type WorkspaceSettings } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export async function getWorkspaceSettings(
  workspace: AuthenticatedWorkspace,
): Promise<WorkspaceSettings> {
  return workspaceSettingsSchema.parse(await requestJson(workspace, "/api/app/settings"));
}

export async function updateWorkspaceSettings(
  workspace: AuthenticatedWorkspace,
  input: WorkspaceSettings,
): Promise<WorkspaceSettings> {
  return workspaceSettingsSchema.parse(
    await requestJson(workspace, "/api/app/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  );
}
