import {
  familyAlertSettingsSchema,
  familyCommentListSchema,
  familyCommentSchema,
  type FamilyAlertSettings,
  type FamilyComment,
  type FamilyCommentSubject,
} from "@zoption/shared";

import type { AuthenticatedWorkspace } from "../workspace";
import { requestJson } from "./transport";

// Every call acts in the family the workspace names.

function subjectPath({ kind, subjectId }: FamilyCommentSubject): string {
  return `/api/app/family/comments/${kind}/${encodeURIComponent(subjectId)}`;
}

export async function getFamilyComments(
  family: AuthenticatedWorkspace,
  subject: FamilyCommentSubject,
): Promise<FamilyComment[]> {
  return familyCommentListSchema.parse(await requestJson(family, subjectPath(subject))).comments;
}

export async function addFamilyComment(
  family: AuthenticatedWorkspace,
  subject: FamilyCommentSubject,
  body: string,
): Promise<FamilyComment> {
  return familyCommentSchema.parse(
    await requestJson(family, subjectPath(subject), {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  );
}

/** The writer, or the owner, removes a comment. */
export function removeFamilyComment(
  family: AuthenticatedWorkspace,
  commentId: string,
): Promise<void> {
  return requestJson(family, `/api/app/family/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}

export async function getFamilyAlertSettings(
  family: AuthenticatedWorkspace,
): Promise<FamilyAlertSettings> {
  return familyAlertSettingsSchema.parse(await requestJson(family, "/api/app/family/alerts"));
}

/** Owner only. */
export async function saveFamilyAlertSettings(
  family: AuthenticatedWorkspace,
  settings: FamilyAlertSettings,
): Promise<FamilyAlertSettings> {
  return familyAlertSettingsSchema.parse(
    await requestJson(family, "/api/app/family/alerts", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  );
}
