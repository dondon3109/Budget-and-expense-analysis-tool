import {
  workspaceSettingsSchema,
  type WorkspaceSettings,
  type WorkspaceSettingsUpdate,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

export interface WorkspaceSettingsApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export function getWorkspaceSettings(api: WorkspaceSettingsApi): Promise<WorkspaceSettings> {
  return apiRequest({
    ...api,
    path: "/api/app/settings",
    method: "GET",
    fallback: "Zoption could not read your workspace settings. Try again shortly.",
    decode: (value) => workspaceSettingsSchema.parse(value),
  });
}

export function updateWorkspaceSettings(
  api: WorkspaceSettingsApi,
  input: WorkspaceSettingsUpdate,
): Promise<WorkspaceSettings> {
  return apiRequest({
    ...api,
    path: "/api/app/settings",
    method: "PUT",
    body: input,
    fallback: "Zoption could not save your workspace settings. Try again shortly.",
    decode: (value) => workspaceSettingsSchema.parse(value),
  });
}
