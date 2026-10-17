import {
  familyRemittanceOverviewSchema,
  familyRemittanceSchema,
  type FamilyRemittance,
  type FamilyRemittanceOverview,
  type FamilyRemittanceReceiveInput,
  type FamilyRemittanceSendInput,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

// Every call acts in the family the workspace names.

export async function getRemittanceOverview(
  family: AuthenticatedWorkspace,
  month: string,
): Promise<FamilyRemittanceOverview> {
  return familyRemittanceOverviewSchema.parse(
    await requestJson(family, `/api/app/family/remittances?month=${encodeURIComponent(month)}`),
  );
}

export async function sendRemittance(
  family: AuthenticatedWorkspace,
  input: FamilyRemittanceSendInput,
): Promise<FamilyRemittance> {
  return familyRemittanceSchema.parse(
    await requestJson(family, "/api/app/family/remittances", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function receiveRemittance(
  family: AuthenticatedWorkspace,
  remittanceId: string,
  input: FamilyRemittanceReceiveInput,
): Promise<FamilyRemittance> {
  return familyRemittanceSchema.parse(
    await requestJson(
      family,
      `/api/app/family/remittances/${encodeURIComponent(remittanceId)}/receive`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  );
}

/** The sender, or the owner, cancels a send that never arrived. */
export function cancelRemittance(
  family: AuthenticatedWorkspace,
  remittanceId: string,
): Promise<void> {
  return requestJson(family, `/api/app/family/remittances/${encodeURIComponent(remittanceId)}`, {
    method: "DELETE",
  });
}
