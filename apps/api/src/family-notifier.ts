import type {
  Currency,
  FamilyCommentSubject,
  FamilyPushData,
  FamilyRemittance,
  PushCategory,
} from "@zoption/shared";

import { pushRepository, type PushRepository } from "./db/push";
import { sendPush } from "./push";
import type { Bindings } from "./types";

export interface FamilyNotice {
  familyTenantId: string;
  category: PushCategory;
  title: string;
  body: string;
  /** Everyone in the family but this person (usually whoever acted). */
  exceptUserId?: string;
  /** Only these people; still limited to current members. */
  onlyUserIds?: string[];
  /** Only the family's owner. */
  ownerOnly?: boolean;
  /** The entry or remittance it is about; a tap on the phone opens it. */
  subject?: FamilyCommentSubject;
}

/**
 * Sends a family notification to its members' devices. Delivery is best effort: a failure is
 * logged and never fails the write that caused it.
 */
export interface FamilyNotifier {
  notify(env: Bindings, notice: FamilyNotice): Promise<void>;
}

/** Display only: the stored amount stays integer minor units. */
export function noticeAmount(amountMinor: number, currency: Currency): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amountMinor / 100);
}

/** Tells the family a remittance arrived; null until it has. */
export function arrivalNotice(
  familyTenantId: string,
  remittance: FamilyRemittance,
): FamilyNotice | null {
  if (!remittance.received) return null;
  const { amountMinor, currency, byUserId } = remittance.received;
  return {
    familyTenantId,
    category: "remittance_received",
    title: "Remittance received",
    body: `${noticeAmount(amountMinor, currency)} arrived from ${noticeAmount(
      remittance.sentAmountMinor,
      remittance.sentCurrency,
    )} sent on ${remittance.sentOn}.`,
    exceptUserId: byUserId,
    subject: { kind: "remittance", subjectId: remittance.id },
  };
}

export function createFamilyNotifier(
  push: PushRepository = pushRepository,
  send: typeof sendPush = sendPush,
): FamilyNotifier {
  return {
    async notify(env, notice) {
      try {
        const { results } = await env.DB.prepare(
          "SELECT user_id AS userId, role FROM tenant_members WHERE tenant_id = ?",
        )
          .bind(notice.familyTenantId)
          .all<{ userId: string; role: string }>();
        const userIds = results
          .filter((row) => !notice.ownerOnly || row.role === "owner")
          .map((row) => row.userId)
          .filter((userId) => userId !== notice.exceptUserId)
          .filter((userId) => !notice.onlyUserIds || notice.onlyUserIds.includes(userId));
        if (userIds.length === 0) return;
        const data: FamilyPushData = {
          path: "/family",
          workspaceId: notice.familyTenantId,
          ...(notice.subject
            ? { subjectKind: notice.subject.kind, subjectId: notice.subject.subjectId }
            : {}),
        };
        await send(env, push, {
          userIds,
          category: notice.category,
          title: notice.title,
          body: notice.body,
          data,
        });
      } catch (error) {
        console.log(
          JSON.stringify({
            message: "Family notification failed",
            category: notice.category,
            errorCode: error instanceof Error ? error.name : "unknown_error",
          }),
        );
      }
    },
  };
}
