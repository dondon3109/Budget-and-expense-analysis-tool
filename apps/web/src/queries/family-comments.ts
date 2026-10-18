import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { FamilyCommentSubject } from "@zoption/shared";

import { getFamilyAlertSettings, getFamilyComments, getFamilyReceipt } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import type { AuthenticatedWorkspace } from "../lib/workspace";

export function useFamilyComments(family: AuthenticatedWorkspace, subject: FamilyCommentSubject) {
  return useQuery({
    queryKey: queryKeys.familyComments(family, subject.kind, subject.subjectId),
    queryFn: () => getFamilyComments(family, subject),
  });
}

/** A comment changes only its own thread. */
export function invalidateAfterCommentWrite(
  queryClient: QueryClient,
  family: AuthenticatedWorkspace,
  subject: FamilyCommentSubject,
) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.familyComments(family, subject.kind, subject.subjectId),
  });
}

export function useFamilyAlertSettings(family: AuthenticatedWorkspace) {
  return useQuery({
    queryKey: queryKeys.familyAlerts(family),
    queryFn: () => getFamilyAlertSettings(family),
  });
}

export function useFamilyReceipt(family: AuthenticatedWorkspace, transactionId: string) {
  return useQuery({
    queryKey: queryKeys.familyReceipt(family, transactionId),
    queryFn: () => getFamilyReceipt(family, transactionId),
  });
}

/** A photo write changes only that entry's photo. */
export function invalidateAfterReceiptWrite(
  queryClient: QueryClient,
  family: AuthenticatedWorkspace,
  transactionId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.familyReceipt(family, transactionId),
  });
}
