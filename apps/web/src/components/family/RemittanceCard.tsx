import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FamilyRemittance } from "@zoption/shared";
import { Plus, Send } from "lucide-react";
import { useState } from "react";

import { cancelRemittance } from "../../lib/api";
import { formatMoney, formatMonth } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamily } from "../../queries/families";
import { invalidateAfterRemittanceWrite, useRemittanceOverview } from "../../queries/remittances";
import { memberName } from "./familyLabels";
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
  const cancel = useMutation({
    mutationFn: (remittanceId: string) => cancelRemittance(family, remittanceId),
    onSuccess: () => invalidateAfterRemittanceWrite(queryClient, family),
  });

  if (!overview) return null;
  const canWrite = detail?.role !== "viewer" && !detail?.closesAt;
  const label = (userId: string) => memberName(detail, userId, family.userId);
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
                  Sent by {label(item.sentByUserId)} on {item.sentOn}
                  {item.provider ? ` via ${item.provider}` : ""}
                </span>
              </div>
              {canWrite && (
                <div className="remittance-actions">
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
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(item.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancel.error && (
        <p className="form-error" role="alert">
          {cancel.error.message}
        </p>
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
                    {item.received!.date}
                  </span>
                </div>
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
    </section>
  );
}
