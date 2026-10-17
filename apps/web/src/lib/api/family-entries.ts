import {
  familyDeletedEntryListSchema,
  familyEntryHistorySchema,
  type FamilyDeletedEntry,
  type FamilyEntryEvent,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

// Every call acts in the family the workspace names.

export async function getFamilyEntryHistory(
  family: AuthenticatedWorkspace,
  transactionId: string,
): Promise<FamilyEntryEvent[]> {
  return familyEntryHistorySchema.parse(
    await requestJson(
      family,
      `/api/app/family/transactions/${encodeURIComponent(transactionId)}/history`,
    ),
  ).events;
}

export async function getFamilyDeletedEntries(
  family: AuthenticatedWorkspace,
): Promise<FamilyDeletedEntry[]> {
  return familyDeletedEntryListSchema.parse(
    await requestJson(family, "/api/app/family/transactions/deleted"),
  ).entries;
}

/** The owner restores any deleted entry; anyone else only what they deleted. */
export function restoreFamilyEntry(
  family: AuthenticatedWorkspace,
  transactionId: string,
): Promise<void> {
  return requestJson(
    family,
    `/api/app/family/transactions/${encodeURIComponent(transactionId)}/restore`,
    { method: "POST" },
  );
}
