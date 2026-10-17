import {
  shareLinkCreatedSchema,
  type ShareLinkCreated,
  type ShareLinkCreateInput,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

/** Creates a public snapshot link for one synced transaction or account balance. */
export function createShareLink(
  api: { accessToken: string; fetchImpl?: typeof fetch },
  input: ShareLinkCreateInput,
): Promise<ShareLinkCreated> {
  return apiRequest({
    ...api,
    path: "/api/app/shares",
    method: "POST",
    body: input,
    fallback: "The link could not be created. Try again shortly.",
    decode: (value) => shareLinkCreatedSchema.parse(value),
  });
}
