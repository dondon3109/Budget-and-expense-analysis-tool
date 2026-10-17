import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FAMILY_RESTORE_DAYS } from "@zoption/shared";
import { RotateCcw } from "lucide-react";

import { restoreFamilyEntry } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamilyDeletedEntries } from "../../queries/family-entries";
import { useFamily } from "../../queries/families";
import { invalidateAfterTransactionWrite } from "../../queries/transactions";
import { formatFamilyDate, memberName } from "./familyLabels";
import "./FamilyEntries.css";

/**
 * Family entries deleted in the restore window. The owner restores any of them; anyone else
 * only what they deleted, matching the server.
 */
export function RecentlyDeletedEntries({ family }: { family: AuthenticatedWorkspace }) {
  const queryClient = useQueryClient();
  const entries = useFamilyDeletedEntries(family).data ?? [];
  const detail = useFamily(family).data;
  const restore = useMutation({
    mutationFn: (transactionId: string) => restoreFamilyEntry(family, transactionId),
    onSettled: () => invalidateAfterTransactionWrite(queryClient, family),
  });

  if (entries.length === 0) return null;
  const canWrite = detail?.role !== "viewer" && !detail?.closesAt;
  return (
    <details className="family-deleted-entries">
      <summary>Recently deleted ({entries.length})</summary>
      <p className="family-entry-muted">
        Deleted entries stay here for {FAMILY_RESTORE_DAYS} days.
      </p>
      <ul>
        {entries.map((deleted) => (
          <li key={deleted.transactionId}>
            <div>
              <strong>
                {deleted.entry.description} ·{" "}
                {formatMoney(Math.abs(deleted.entry.amountMinor), deleted.entry.currency)}
              </strong>
              <span>
                {deleted.entry.date} · deleted by{" "}
                {memberName(detail, deleted.deletedByUserId, family.userId)} on{" "}
                {formatFamilyDate(deleted.deletedAt)}
              </span>
            </div>
            {canWrite &&
              (detail?.role === "owner" || deleted.deletedByUserId === family.userId) && (
                <button
                  className="button secondary compact"
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(deleted.transactionId)}
                >
                  <RotateCcw size={15} aria-hidden="true" /> Restore
                </button>
              )}
          </li>
        ))}
      </ul>
      {restore.error && (
        <p className="form-error" role="alert">
          {restore.error.message}
        </p>
      )}
    </details>
  );
}
