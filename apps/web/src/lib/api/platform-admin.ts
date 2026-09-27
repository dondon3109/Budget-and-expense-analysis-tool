import type { SponsoredProSeat, SponsoredProSeatSummary } from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

export function syncVerifiedIdentity(workspace: AuthenticatedWorkspace): Promise<void> {
  return requestJson(workspace, "/api/app/identity", { method: "POST", body: JSON.stringify({}) });
}

export function getSponsoredProSeats(
  workspace: AuthenticatedWorkspace,
): Promise<SponsoredProSeatSummary> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats");
}

export function addSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function inviteSponsoredProRecipient(
  workspace: AuthenticatedWorkspace,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, "/api/app/admin/sponsored-seats/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function replaceSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
  email: string,
): Promise<SponsoredProSeat> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}`, {
    method: "PUT",
    body: JSON.stringify({ email }),
  });
}

export function revokeSponsoredProSeat(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
): Promise<void> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}`, {
    method: "DELETE",
  });
}

export function resendSponsoredProInvitation(
  workspace: AuthenticatedWorkspace,
  slotNumber: number,
): Promise<void> {
  return requestJson(workspace, `/api/app/admin/sponsored-seats/${slotNumber}/invitation`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
