import {
  familyCommentListSchema,
  familyCommentSchema,
  familyDeletedEntryListSchema,
  familyAlertSettingsSchema,
  familyClosureSchema,
  familyDetailSchema,
  familySharedBalanceListSchema,
  familyEntryHistorySchema,
  type FamilyAlertSettings,
  type FamilyClosure,
  type FamilyComment,
  type FamilyCommentSubject,
  type FamilyDeletedEntry,
  type FamilyDetail,
  type FamilyEntryEvent,
  type FamilyInviteInput,
  type FamilyMemberRole,
  type FamilySharedBalance,
  type FamilyTransactionShareInput,
} from "@zoption/shared";

import { z } from "zod";

import { apiRequest } from "./authenticated";

// The online-only family surfaces. Every call acts in the family `workspaceId` names.

export interface FamilyApi {
  accessToken: string;
  workspaceId: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const ignoreBody = (): void => undefined;

/** The family, its members, invitations, seats, and closing date. */
export function getFamilyDetail(api: FamilyApi): Promise<FamilyDetail> {
  return apiRequest({
    ...api,
    path: "/api/app/family",
    method: "GET",
    fallback: "The family could not be loaded.",
    decode: (value) => familyDetailSchema.parse(value),
  });
}

function commentPath({ kind, subjectId }: FamilyCommentSubject): string {
  return `/api/app/family/comments/${kind}/${encodeURIComponent(subjectId)}`;
}

export async function getFamilyComments(
  api: FamilyApi,
  subject: FamilyCommentSubject,
): Promise<FamilyComment[]> {
  const list = await apiRequest({
    ...api,
    path: commentPath(subject),
    method: "GET",
    fallback: "Comments could not be loaded.",
    decode: (value) => familyCommentListSchema.parse(value),
  });
  return list.comments;
}

export function addFamilyComment(
  api: FamilyApi,
  subject: FamilyCommentSubject,
  body: string,
): Promise<FamilyComment> {
  return apiRequest({
    ...api,
    path: commentPath(subject),
    method: "POST",
    body: { body },
    fallback: "Your comment could not be posted.",
    decode: (value) => familyCommentSchema.parse(value),
  });
}

/** The writer, or the owner, removes a comment. */
export function removeFamilyComment(api: FamilyApi, commentId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/comments/${encodeURIComponent(commentId)}`,
    method: "DELETE",
    fallback: "The comment could not be removed.",
    decode: ignoreBody,
  });
}

export async function getFamilyEntryHistory(
  api: FamilyApi,
  transactionId: string,
): Promise<FamilyEntryEvent[]> {
  const history = await apiRequest({
    ...api,
    path: `/api/app/family/transactions/${encodeURIComponent(transactionId)}/history`,
    method: "GET",
    fallback: "The entry's history could not be loaded.",
    decode: (value) => familyEntryHistorySchema.parse(value),
  });
  return history.events;
}

export async function getFamilyDeletedEntries(api: FamilyApi): Promise<FamilyDeletedEntry[]> {
  const list = await apiRequest({
    ...api,
    path: "/api/app/family/transactions/deleted",
    method: "GET",
    fallback: "Recently deleted entries could not be loaded.",
    decode: (value) => familyDeletedEntryListSchema.parse(value),
  });
  return list.entries;
}

/** The owner restores any deleted entry; anyone else only what they deleted. */
export function restoreFamilyEntry(api: FamilyApi, transactionId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/transactions/${encodeURIComponent(transactionId)}/restore`,
    method: "POST",
    fallback: "The entry could not be restored.",
    decode: ignoreBody,
  });
}

export function inviteFamilyMember(api: FamilyApi, input: FamilyInviteInput): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/family/invitations",
    method: "POST",
    body: input,
    fallback: "The invitation could not be sent.",
    decode: ignoreBody,
  });
}

export function resendFamilyInvitation(api: FamilyApi, invitationId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/invitations/${encodeURIComponent(invitationId)}/resend`,
    method: "POST",
    fallback: "The invitation could not be resent.",
    decode: ignoreBody,
  });
}

export function revokeFamilyInvitation(api: FamilyApi, invitationId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/invitations/${encodeURIComponent(invitationId)}`,
    method: "DELETE",
    fallback: "The invitation could not be revoked.",
    decode: ignoreBody,
  });
}

export function setFamilyMemberRole(
  api: FamilyApi,
  userId: string,
  role: FamilyMemberRole,
): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/members/${encodeURIComponent(userId)}`,
    method: "PATCH",
    body: { role },
    fallback: "The role could not be changed.",
    decode: ignoreBody,
  });
}

/** Only after the owner has read the seat rules. */
export function removeFamilyMember(api: FamilyApi, userId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/members/${encodeURIComponent(userId)}/remove`,
    method: "POST",
    body: { seatRulesAccepted: true },
    fallback: "The member could not be removed.",
    decode: ignoreBody,
  });
}

export function transferFamily(api: FamilyApi, userId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/family/transfer",
    method: "POST",
    body: { userId },
    fallback: "Ownership could not be handed over.",
    decode: ignoreBody,
  });
}

export function closeFamily(api: FamilyApi): Promise<FamilyClosure> {
  return apiRequest({
    ...api,
    path: "/api/app/family/close",
    method: "POST",
    fallback: "The family could not be closed.",
    decode: (value) => familyClosureSchema.parse(value),
  });
}

export function getFamilyAlertSettings(api: FamilyApi): Promise<FamilyAlertSettings> {
  return apiRequest({
    ...api,
    path: "/api/app/family/alerts",
    method: "GET",
    fallback: "The family's alerts could not be loaded.",
    decode: (value) => familyAlertSettingsSchema.parse(value),
  });
}

/** Owner only. */
export function saveFamilyAlertSettings(
  api: FamilyApi,
  settings: FamilyAlertSettings,
): Promise<FamilyAlertSettings> {
  return apiRequest({
    ...api,
    path: "/api/app/family/alerts",
    method: "PUT",
    body: settings,
    fallback: "The alerts could not be saved.",
    decode: (value) => familyAlertSettingsSchema.parse(value),
  });
}

// Only what the share sheet picks from; the Worker sends more fields, which are dropped.
const shareOptionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      archived: z.boolean(),
      kind: z.enum(["income", "expense", "transfer"]).optional(),
    }),
  ),
});
export type FamilyShareOption = z.infer<typeof shareOptionsSchema>["items"][number];

/** The family's open accounts and categories, for choosing where a shared copy lands. */
export async function getFamilyShareOptions(
  api: FamilyApi,
): Promise<{ accounts: FamilyShareOption[]; categories: FamilyShareOption[] }> {
  const read = (path: string) =>
    apiRequest({
      ...api,
      path,
      method: "GET",
      fallback: "The family's accounts could not be loaded.",
      decode: (value) => shareOptionsSchema.parse(value).items.filter((item) => !item.archived),
    });
  const [accounts, categories] = await Promise.all([
    read("/api/app/accounts"),
    read("/api/app/categories"),
  ]);
  return { accounts, categories };
}

/** Copies one of the person's own synced transactions into the family; the Worker reads the source. */
export function shareTransactionToFamily(
  api: FamilyApi,
  input: FamilyTransactionShareInput,
): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/family/shares/transactions",
    method: "POST",
    body: input,
    fallback: "The entry could not be shared.",
    decode: ignoreBody,
  });
}

export function shareBalanceToFamily(api: FamilyApi, accountId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: "/api/app/family/shares/balances",
    method: "POST",
    body: { accountId },
    fallback: "The balance could not be shared.",
    decode: ignoreBody,
  });
}

export async function getFamilySharedBalances(api: FamilyApi): Promise<FamilySharedBalance[]> {
  const list = await apiRequest({
    ...api,
    path: "/api/app/family/shares/balances",
    method: "GET",
    fallback: "Shared balances could not be loaded.",
    decode: (value) => familySharedBalanceListSchema.parse(value),
  });
  return list.balances;
}

/** Owner only. */
export function removeFamilySharedBalance(api: FamilyApi, shareId: string): Promise<void> {
  return apiRequest({
    ...api,
    path: `/api/app/family/shares/balances/${encodeURIComponent(shareId)}`,
    method: "DELETE",
    fallback: "The shared balance could not be removed.",
    decode: ignoreBody,
  });
}
