import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FamilyRemittance } from "@zoption/shared";
import { MessageSquare, Plus, Send } from "lucide-react";
import { useState } from "react";

import { cancelRemittance } from "../../lib/api";
import { formatMoney, formatMonth } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamily } from "../../queries/families";
import { invalidateAfterRemittanceWrite, useRemittanceOverview } from "../../queries/remittances";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { formatEntryDate, memberName } from "./familyLabels";
import { FamilyThreadDialog } from "./FamilyThreadDialog";
import { RemittanceDialog } from "./RemittanceDialog";
import "./RemittanceCard.css";

/**
 * Sent · Spent · Left for one family month, with sends waiting to be confirmed and earlier
 * months below. Until the family records a remittance it is a single prompt line.
 */
export function RemittanceCard({
  family,
  month,
}: {
  family: AuthenticatedWorkspace;
  /** `YYYY-MM`. */
  month: string;
}) {
  const queryClient = useQueryClient();
  const overview = useRemittanceOverview(family, `${month}-01`).data;
  const detail = useFamily(family).data;
  const [dialog, setDialog] = useState<{ remittance?: FamilyRemittance }>();
  const [threadOf, setThreadOf] = useState<FamilyRemittance>();
  const [cancelling, setCancelling] = useState<FamilyRemittance>();
  const cancel = useMutation({
    mutationFn: (remittanceId: string) => cancelRemittance(family, remittanceId),
    onSuccess: async () => {
      await invalidateAfterRemittanceWrite(queryClient, family);
      setCancelling(undefined);
    },
  });

  if (!overview) return null;
  const canWrite = detail?.role !== "viewer" && !detail?.closesAt;
  const label = (userId: string) => memberName(detail, userId, family.userId);
  const commentsButton = (item: FamilyRemittance) => (
    <button className="icon-button" type="button" onClick={() => setThreadOf(item)}>
      <MessageSquare size={15} aria-hidden="true" />
      <span className="sr-only">Comments</span>
    </button>
  );
  const dialogElement = dialog && (
    <RemittanceDialog
      family={family}
      familyCurrency={overview.currency}
      remittance={dialog.remittance}
      onClose={() => setDialog(undefined)}
    />
  );

  if (!overview.hasRemittances) {
    if (!canWrite) return null;
    return (
      <section className="remittance-prompt">
        <p>
          Sending money home? Record it here, and the family sees what arrived and what is left.
        </p>
        <button className="button secondary compact" type="button" onClick={() => setDialog({})}>
          <Send size={15} aria-hidden="true" /> Record a remittance
        </button>
        {dialogElement}
      </section>
    );
  }

  const money = (amountMinor: number) => formatMoney(amountMinor, overview.currency);
  return (
    <section className="remittance-card" aria-labelledby="remittance-card-title">
      <header>
        <h2 id="remittance-card-title">Money sent home</h2>
        {canWrite && (
          <button className="button secondary compact" type="button" onClick={() => setDialog({})}>
            <Plus size={15} aria-hidden="true" /> Record
          </button>
        )}
      </header>
      <dl className="remittance-totals">
        <div>
          <dt>Sent this month</dt>
          <dd>{money(overview.month.sentMinor)}</dd>
        </div>
        <div>
          <dt>Spent this month</dt>
          <dd>{money(overview.month.spentMinor)}</dd>
        </div>
        <div>
          <dt>Left now</dt>
          <dd>{money(overview.leftMinor)}</dd>
        </div>
      </dl>

      {overview.pending.length > 0 && (
        <ul className="remittance-list" aria-label="On the way">
          {overview.pending.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{formatMoney(item.sentAmountMinor, item.sentCurrency)} on the way</strong>
                <span>
                  Sent by {label(item.sentByUserId)} on {formatEntryDate(item.sentOn)}
                  {item.provider ? ` via ${item.provider}` : ""}
                </span>
              </div>
              <div className="remittance-actions">
                {commentsButton(item)}
                {canWrite && (
                  <>
                    <button
                      className="button primary compact"
                      type="button"
                      onClick={() => setDialog({ remittance: item })}
                    >
                      Confirm received
                    </button>
                    {(detail?.role === "owner" || item.sentByUserId === family.userId) && (
                      <button
                        className="button secondary compact"
                        type="button"
                        onClick={() => {
                          cancel.reset();
                          setCancelling(item);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {overview.recent.length > 0 && (
        <details className="remittance-history">
          <summary>Recent and earlier months</summary>
          <ul className="remittance-list">
            {overview.recent.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {formatMoney(item.received!.amountMinor, item.received!.currency)}
                  </strong>
                  <span>
                    {formatMoney(item.sentAmountMinor, item.sentCurrency)} from{" "}
                    {label(item.sentByUserId)}, confirmed by {label(item.received!.byUserId)} on{" "}
                    {formatEntryDate(item.received!.date)}
                  </span>
                </div>
                {commentsButton(item)}
              </li>
            ))}
          </ul>
          {overview.history.length > 0 && (
            <table className="remittance-months">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Spent</th>
                </tr>
              </thead>
              <tbody>
                {overview.history.map((row) => (
                  <tr key={row.month}>
                    <th scope="row">
                      {formatMonth(row.month.slice(0, 7))} {row.month.slice(0, 4)}
                    </th>
                    <td>{money(row.sentMinor)}</td>
                    <td>{money(row.spentMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      )}
      {dialogElement}
      {cancelling && (
        <ConfirmDialog
          title="Cancel this send?"
          consequence={`The ${formatMoney(cancelling.sentAmountMinor, cancelling.sentCurrency)} sent on ${formatEntryDate(cancelling.sentOn)} leaves the family's list. It never arrived, so no balance changes. This cannot be undone.`}
          confirmLabel="Cancel send"
          busyLabel="Cancelling…"
          cancelLabel="Keep it"
          busy={cancel.isPending}
          error={cancel.error?.message}
          onConfirm={() => cancel.mutate(cancelling.id)}
          onClose={() => setCancelling(undefined)}
        />
      )}
      {threadOf && (
        <FamilyThreadDialog
          family={family}
          subject={{ kind: "remittance", subjectId: threadOf.id }}
          title={`${formatMoney(threadOf.sentAmountMinor, threadOf.sentCurrency)} sent on ${formatEntryDate(threadOf.sentOn)}`}
          onClose={() => setThreadOf(undefined)}
        />
      )}
    </section>
  );
}
