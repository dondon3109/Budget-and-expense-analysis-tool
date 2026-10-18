import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, type ChangeEvent } from "react";

import { removeFamilyReceipt, uploadFamilyReceipt } from "../../lib/api";
import { prepareReceiptPhoto } from "../../lib/receiptPhoto";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { invalidateAfterReceiptWrite, useFamilyReceipt } from "../../queries/family-comments";
import { useFamily } from "../../queries/families";

/**
 * The receipt photo on one family transaction. Everyone sees it; the entry's author or the
 * owner adds, replaces, or removes it, the same rule as editing the entry.
 */
export function FamilyReceipt({
  family,
  transactionId,
  authorUserId,
}: {
  family: AuthenticatedWorkspace;
  transactionId: string;
  authorUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const receipt = useFamilyReceipt(family, transactionId);
  const detail = useFamily(family).data;
  const photoUrl = useMemo(
    () => (receipt.data ? URL.createObjectURL(receipt.data) : undefined),
    [receipt.data],
  );
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );
  const refresh = () => invalidateAfterReceiptWrite(queryClient, family, transactionId);
  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadFamilyReceipt(family, transactionId, await prepareReceiptPhoto(file)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => removeFamilyReceipt(family, transactionId),
    onSuccess: refresh,
  });

  const canChange =
    detail !== undefined &&
    !detail.closesAt &&
    (detail.role === "owner" || (detail.role === "member" && authorUserId === family.userId));
  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error ?? receipt.error;

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) upload.mutate(file);
  }

  return (
    <section className="family-receipt" aria-label="Receipt photo">
      {receipt.isPending && <p className="family-entry-muted">Loading…</p>}
      {receipt.isSuccess && !photoUrl && <p className="family-entry-muted">No receipt photo.</p>}
      {photoUrl && (
        <a href={photoUrl} target="_blank" rel="noreferrer">
          <img src={photoUrl} alt="Receipt photo" />
        </a>
      )}
      {canChange && (
        <div className="family-receipt-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera size={15} aria-hidden="true" />
            {upload.isPending ? "Saving…" : photoUrl ? "Replace photo" : "Add photo"}
          </button>
          {photoUrl && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              <Trash2 size={15} aria-hidden="true" /> Remove
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose receipt photo"
            onChange={choose}
          />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
    </section>
  );
}
