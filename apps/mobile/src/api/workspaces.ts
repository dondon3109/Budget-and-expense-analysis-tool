import {
  familyInvitationListSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  type FamilyInvitation,
  type WorkspaceList,
  type WorkspaceSummary,
} from "@zoption/shared";

import { apiRequest } from "./authenticated";

// The person's side of families: these act as the signed-in person in their personal workspace.

export interface PersonalApi {
  accessToken: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// The Worker refuses creating, joining, and removing without this acknowledgement.
const SEAT_RULES = { seatRulesAccepted: true } as const;
const ignoreBody = (): void => undefined;

/** The personal workspace and every family the signed-in person belongs to. */
export function listWorkspaces(api: PersonalApi): Promise<WorkspaceList> {
  return apiRequest({
    ...api,
    path: "/api/app/workspaces",
    method: "GET",
    fallback: "Your families could not be loaded.",
    decode: (value) => workspaceListSchema.parse(value),
  });
}

/** Only after the person has read the seat rules. */
export function createFamily(api: PersonalApi, name: string): Promise<WorkspaceSummary> {
  return apiRequest({
    ...api,
    path: "/api/app/families",
    method: "POST",
    body: { name, ...SEAT_RULES },
    fallback: "The family could not be created.",
    decode: (value) => workspaceSummarySchema.parse(value),
  });
}

export async function listFamilyInvitations(api: PersonalApi): Promise<FamilyInvitation[]> {
  const list = await apiRequest({
    ...api,
    path: "/api/app/families/invitations",
    method: "GET",
    fallback: "Your invitations could not be loaded.",
    decode: (value) => familyInvitationListSchema.parse(value),
  });
  return list.invitations;
}

/** Only after the person has read the seat rules. */
export function acceptFamilyInvitation(api: PersonalApi, invitationId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/families/invitations/${encodeURIComponent(invitationId)}/accept`,
    method: "POST",
    body: SEAT_RULES,
    fallback: "The invitation could not be accepted.",
    decode: ignoreBody,
  });
}

export function declineFamilyInvitation(api: PersonalApi, invitationId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/families/invitations/${encodeURIComponent(invitationId)}/decline`,
    method: "POST",
    fallback: "The invitation could not be declined.",
    decode: ignoreBody,
  });
}

export function leaveFamily(api: PersonalApi, familyId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/families/${encodeURIComponent(familyId)}/leave`,
    method: "POST",
    fallback: "You could not leave the family.",
    decode: ignoreBody,
  });
}
