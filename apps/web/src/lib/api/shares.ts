import {
  shareLinkCreatedSchema,
  shareLinkListSchema,
  type ShareLink,
  type ShareLinkCreateInput,
  type ShareLinkCreated,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

/** Freezes a snapshot and returns its link. The URL holds the token and is shown only now. */
export async function createShareLink(
  workspace: AuthenticatedWorkspace,
  input: ShareLinkCreateInput,
): Promise<ShareLinkCreated> {
  return shareLinkCreatedSchema.parse(
    await requestJson(workspace, "/api/app/shares", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function listShareLinks(workspace: AuthenticatedWorkspace): Promise<ShareLink[]> {
  return shareLinkListSchema.parse(await requestJson(workspace, "/api/app/shares")).items;
}

export function revokeShareLink(workspace: AuthenticatedWorkspace, id: string): Promise<void> {
  return requestJson(workspace, `/api/app/shares/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
