import { useMutation, useQueryClient } from "@tanstack/react-query";
import { familyCommentInputSchema, type FamilyCommentSubject } from "@zoption/shared";
import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { addFamilyComment, removeFamilyComment } from "../../lib/api";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { invalidateAfterCommentWrite, useFamilyComments } from "../../queries/family-comments";
import { useFamily } from "../../queries/families";
import { formatFamilyDate, memberName } from "./familyLabels";

/** The thread under one family entry or remittance; viewers and a closing family only read. */
export function FamilyComments({
  family,
  subject,
}: {
  family: AuthenticatedWorkspace;
  subject: FamilyCommentSubject;
}) {
  const queryClient = useQueryClient();
  const comments = useFamilyComments(family, subject);
  const detail = useFamily(family).data;
  const [draft, setDraft] = useState("");
  const refresh = () => invalidateAfterCommentWrite(queryClient, family, subject);
  const add = useMutation({
    mutationFn: (body: string) => addFamilyComment(family, subject, body),
    onSuccess: async () => {
      setDraft("");
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (commentId: string) => removeFamilyComment(family, commentId),
    onSuccess: refresh,
  });

  const canWrite = detail !== undefined && detail.role !== "viewer" && !detail.closesAt;
  const error = add.error ?? remove.error ?? comments.error;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = familyCommentInputSchema.safeParse({ body: draft });
    if (parsed.success) add.mutate(parsed.data.body);
  }

  return (
    <section className="family-comments" aria-label="Comments">
      {comments.isSuccess && comments.data.length === 0 && (
        <p className="family-entry-muted">No comments yet.</p>
      )}
      {(comments.data ?? []).length > 0 && (
        <ul>
          {comments.data!.map((comment) => (
            <li key={comment.id}>
              <div>
                <strong>
                  {memberName(detail, comment.userId, family.userId, true)} ·{" "}
                  {formatFamilyDate(comment.createdAt)}
                </strong>
                <p>{comment.body}</p>
              </div>
              {canWrite && (detail.role === "owner" || comment.userId === family.userId) && (
                <button
                  className="icon-button"
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(comment.id)}
                >
                  <X size={15} aria-hidden="true" />
                  <span className="sr-only">Remove comment</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form className="family-comment-form" onSubmit={submit}>
          <label>
            <span className="sr-only">Add a comment</span>
            <input
              value={draft}
              maxLength={500}
              placeholder="Add a comment"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button
            className="button primary compact"
            type="submit"
            disabled={add.isPending || !draft.trim()}
          >
            Post
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
