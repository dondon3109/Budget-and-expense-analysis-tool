import {
  familyClosureSchema,
  familyDetailSchema,
  familyInvitationListSchema,
  familySharedBalanceListSchema,
  myBalanceShareListSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  type FamilyClosure,
  type FamilyDetail,
  type FamilyInvitation,
  type FamilyInviteInput,
  type FamilyMemberRole,
  type FamilySharedBalance,
  type FamilyTransactionShareInput,
  type MyBalanceShare,
  type TransactionListItem,
  type WorkspaceList,
  type WorkspaceSummary,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

// Two surfaces, as on the Worker: `/families` and `/workspaces` act as the signed-in person and
// take their personal workspace; `/family` acts in the family that the workspace passed names.

const SEAT_RULES = JSON.stringify({ seatRulesAccepted: true });

export async function getWorkspaces(personal: AuthenticatedWorkspace): Promise<WorkspaceList> {
  return workspaceListSchema.parse(await requestJson(personal, "/api/app/workspaces"));
}

/** Only after the person has read the seat rules. */
export async function createFamily(
  personal: AuthenticatedWorkspace,
  name: string,
): Promise<WorkspaceSummary> {
  return workspaceSummarySchema.parse(
    await requestJson(personal, "/api/app/families", {
      method: "POST",
      body: JSON.stringify({ name, seatRulesAccepted: true }),
    }),
  );
}

export async function getFamilyInvitations(
  personal: AuthenticatedWorkspace,
): Promise<FamilyInvitation[]> {
  return familyInvitationListSchema.parse(
    await requestJson(personal, "/api/app/families/invitations"),
  ).invitations;
}

/** Only after the person has read the seat rules. */
export function acceptFamilyInvitation(
  personal: AuthenticatedWorkspace,
  invitationId: string,
): Promise<void> {
  return requestJson(
    personal,
    `/api/app/families/invitations/${encodeURIComponent(invitationId)}/accept`,
    { method: "POST", body: SEAT_RULES },
  );
}

export function declineFamilyInvitation(
  personal: AuthenticatedWorkspace,
  invitationId: string,
): Promise<void> {
  return requestJson(
    personal,
    `/api/app/families/invitations/${encodeURIComponent(invitationId)}/decline`,
    { method: "POST" },
  );
}

export function leaveFamily(personal: AuthenticatedWorkspace, familyId: string): Promise<void> {
  return requestJson(personal, `/api/app/families/${encodeURIComponent(familyId)}/leave`, {
    method: "POST",
  });
}

export async function getFamily(family: AuthenticatedWorkspace): Promise<FamilyDetail> {
  return familyDetailSchema.parse(await requestJson(family, "/api/app/family"));
}

export function inviteFamilyMember(
  family: AuthenticatedWorkspace,
  input: FamilyInviteInput,
): Promise<void> {
  return requestJson(family, "/api/app/family/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendFamilyInvitation(
  family: AuthenticatedWorkspace,
  invitationId: string,
): Promise<void> {
  return requestJson(
    family,
    `/api/app/family/invitations/${encodeURIComponent(invitationId)}/resend`,
    { method: "POST" },
  );
}

export function revokeFamilyInvitation(
  family: AuthenticatedWorkspace,
  invitationId: string,
): Promise<void> {
  return requestJson(family, `/api/app/family/invitations/${encodeURIComponent(invitationId)}`, {
    method: "DELETE",
  });
}

export function setFamilyMemberRole(
  family: AuthenticatedWorkspace,
  userId: string,
  role: FamilyMemberRole,
): Promise<void> {
  return requestJson(family, `/api/app/family/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

/** Only after the owner has read the seat rules. */
export function removeFamilyMember(family: AuthenticatedWorkspace, userId: string): Promise<void> {
  return requestJson(family, `/api/app/family/members/${encodeURIComponent(userId)}/remove`, {
    method: "POST",
    body: SEAT_RULES,
  });
}

export function transferFamily(family: AuthenticatedWorkspace, userId: string): Promise<void> {
  return requestJson(family, "/api/app/family/transfer", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function closeFamily(family: AuthenticatedWorkspace): Promise<FamilyClosure> {
  return familyClosureSchema.parse(
    await requestJson(family, "/api/app/family/close", { method: "POST" }),
  );
}

/** Copies one of the person's own transactions into `family`; the server reads the source. */
export function shareTransactionToFamily(
  family: AuthenticatedWorkspace,
  input: FamilyTransactionShareInput,
): Promise<TransactionListItem> {
  return requestJson(family, "/api/app/family/shares/transactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function shareBalanceToFamily(
  family: AuthenticatedWorkspace,
  accountId: string,
): Promise<void> {
  return requestJson(family, "/api/app/family/shares/balances", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export async function getFamilySharedBalances(
  family: AuthenticatedWorkspace,
): Promise<FamilySharedBalance[]> {
  return familySharedBalanceListSchema.parse(
    await requestJson(family, "/api/app/family/shares/balances"),
  ).balances;
}

/** Owner only. */
export function removeFamilySharedBalance(
  family: AuthenticatedWorkspace,
  shareId: string,
): Promise<void> {
  return requestJson(family, `/api/app/family/shares/balances/${encodeURIComponent(shareId)}`, {
    method: "DELETE",
  });
}

export async function getMyBalanceShares(
  personal: AuthenticatedWorkspace,
): Promise<MyBalanceShare[]> {
  return myBalanceShareListSchema.parse(
    await requestJson(personal, "/api/app/families/balance-shares"),
  ).shares;
}

export function stopBalanceShare(personal: AuthenticatedWorkspace, shareId: string): Promise<void> {
  return requestJson(
    personal,
    `/api/app/families/balance-shares/${encodeURIComponent(shareId)}/stop`,
    { method: "POST" },
  );
}
