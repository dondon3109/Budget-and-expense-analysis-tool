import { useQuery } from "@tanstack/react-query";

import { getFamilyDeletedEntries, getFamilyEntryHistory } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function useFamilyEntryHistory(family: AuthenticatedWorkspace, transactionId: string) {
  return useQuery({
    queryKey: queryKeys.familyEntryHistory(family, transactionId),
    queryFn: () => getFamilyEntryHistory(family, transactionId),
  });
}

export function useFamilyDeletedEntries(family: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.familyDeletedEntries(family),
    queryFn: () => getFamilyDeletedEntries(family),
  });
}
