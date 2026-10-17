import { isCurrency, type FamilyComment, type FamilyCommentSubject } from "@zoption/shared";

import { HttpError } from "../errors";
import { noticeAmount } from "../family-notifier";
import type { Bindings } from "../types";

/** Who a new comment notifies, and how the notice names what it is about. */
export interface AddedComment {
  comment: FamilyComment;
  /** The subject's author and everyone who commented on it before, minus the commenter. */
  audience: string[];
  subjectLabel: string;
}

export interface FamilyCommentRepository {
  list(env: Bindings, tenantId: string, subject: FamilyCommentSubject): Promise<FamilyComment[]>;
  add(
    env: Bindings,
    tenantId: string,
    userId: string,
    subject: FamilyCommentSubject,
    body: string,
  ): Promise<AddedComment>;
  /** `authorOnly` limits it to that person's own comments; the owner removes any. */
  remove(env: Bindings, tenantId: string, commentId: string, authorOnly?: string): Promise<void>;
}

const COMMENT_SELECT = `SELECT id, user_id AS userId, body, created_at AS createdAt
  FROM family_comments`;

/** The subject's author and label, or a 404 when it is not in this family. */
async function readSubject(
  env: Bindings,
  tenantId: string,
  subject: FamilyCommentSubject,
): Promise<{ authorUserId: string | null; label: string }> {
  if (subject.kind === "transaction") {
    const row = await env.DB.prepare(
      `SELECT description, created_by_user_id AS authorUserId
       FROM transactions WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, subject.subjectId)
      .first<{ description: string; authorUserId: string | null }>();
    if (!row) throw new HttpError(404, "transaction_not_found", "Transaction not found.");
    return { authorUserId: row.authorUserId, label: `“${row.description}”` };
  }
  const row = await env.DB.prepare(
    `SELECT sent_by_user_id AS authorUserId, sent_amount_minor AS amountMinor,
            sent_currency AS currency
     FROM family_remittances WHERE tenant_id = ? AND id = ?`,
  )
    .bind(tenantId, subject.subjectId)
    .first<{ authorUserId: string; amountMinor: number; currency: string }>();
  if (!row) throw new HttpError(404, "remittance_not_found", "That remittance was not found.");
  const amount = isCurrency(row.currency) ? noticeAmount(row.amountMinor, row.currency) : "";
  return { authorUserId: row.authorUserId, label: `the ${amount} remittance` };
}

export const familyCommentRepository: FamilyCommentRepository = {
  async list(env, tenantId, subject) {
    const { results } = await env.DB.prepare(
      `${COMMENT_SELECT}
       WHERE tenant_id = ? AND subject_kind = ? AND subject_id = ?
       ORDER BY created_at, id`,
    )
      .bind(tenantId, subject.kind, subject.subjectId)
      .all<FamilyComment>();
    return results;
  },

  async add(env, tenantId, userId, subject, body) {
    const { authorUserId, label } = await readSubject(env, tenantId, subject);
    const { results: earlier } = await env.DB.prepare(
      `SELECT DISTINCT user_id AS userId FROM family_comments
       WHERE tenant_id = ? AND subject_kind = ? AND subject_id = ?`,
    )
      .bind(tenantId, subject.kind, subject.subjectId)
      .all<{ userId: string }>();
    const comment = await env.DB.prepare(
      `INSERT INTO family_comments (id, tenant_id, subject_kind, subject_id, user_id, body)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, user_id AS userId, body, created_at AS createdAt`,
    )
      .bind(crypto.randomUUID(), tenantId, subject.kind, subject.subjectId, userId, body)
      .first<FamilyComment>();
    const audience = new Set([
      ...(authorUserId ? [authorUserId] : []),
      ...earlier.map((row) => row.userId),
    ]);
    audience.delete(userId);
    return { comment: comment!, audience: [...audience], subjectLabel: label };
  },

  async remove(env, tenantId, commentId, authorOnly) {
    const result = await env.DB.prepare(
      `DELETE FROM family_comments
       WHERE tenant_id = ? AND id = ? AND (? IS NULL OR user_id = ?)`,
    )
      .bind(tenantId, commentId, authorOnly ?? null, authorOnly ?? null)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new HttpError(
        404,
        "comment_not_found",
        "Only the person who wrote a comment, or the owner, can remove it.",
      );
    }
  },
};
