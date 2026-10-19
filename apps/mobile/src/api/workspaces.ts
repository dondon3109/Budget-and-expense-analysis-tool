import { workspaceListSchema, type WorkspaceList } from "@zoption/shared";

import { apiRequest } from "./authenticated";

/** The personal workspace and every family the signed-in person belongs to. */
export function listWorkspaces(api: {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<WorkspaceList> {
  return apiRequest({
    ...api,
    path: "/api/app/workspaces",
    method: "GET",
    fallback: "Your families could not be loaded.",
    decode: (value) => workspaceListSchema.parse(value),
  });
}
