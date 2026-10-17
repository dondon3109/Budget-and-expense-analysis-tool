import type { FamilyCommentSubject, FamilyEntryEvent, FamilyEntryView } from "@zoption/shared";
import { X } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { formatMoney } from "../../lib/formatters";
import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { useFamilyEntryHistory } from "../../queries/family-entries";
import { useFamily } from "../../queries/families";
import { FamilyComments } from "./FamilyComments";
import { formatFamilyDate, memberName } from "./familyLabels";
import "./FamilyEntries.css";

const ACTION_VERBS = { updated: "changed", deleted: "deleted", restored: "restored" } as const;

/** The fields that differ between two versions of an entry, as "Amount: ₱1,200 → ₱1,500". */
function changes(before: FamilyEntryView, after: FamilyEntryView): string[] {
  const fields: [string, (view: FamilyEntryView) => string][] = [
    ["Amount", (view) => formatMoney(Math.abs(view.amountMinor), view.currency)],
    ["Date", (view) => view.date],
    ["Description", (view) => view.description],
    ["Category", (view) => view.categoryName],
    ["Account", (view) => view.accountName],
    ["Notes", (view) => view.notes || "none"],
  ];
  return fields.flatMap(([label, read]) =>
    read(before) === read(after) ? [] : [`${label}: ${read(before)} → ${read(after)}`],
  );
}

function eventDetail(event: FamilyEntryEvent): string[] {
  if (event.action === "updated" && event.before && event.after) {
    return changes(event.before, event.after);
  }
  return [];
}

/** Comments on a family entry or remittance, and for an entry who changed it, newest first. */
export function FamilyThreadDialog({
  family,
  subject,
  title,
  onClose,
}: {
  family: AuthenticatedWorkspace;
  subject: FamilyCommentSubject;
  title: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { onEscape: onClose });

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal family-thread"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">{subject.kind === "transaction" ? "Entry" : "Remittance"}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </header>
        <h3 className="family-thread-heading">Comments</h3>
        <FamilyComments family={family} subject={subject} />
        {subject.kind === "transaction" && (
          <>
            <h3 className="family-thread-heading">History</h3>
            <EntryHistory family={family} transactionId={subject.subjectId} />
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}

function EntryHistory({
  family,
  transactionId,
}: {
  family: AuthenticatedWorkspace;
  transactionId: string;
}) {
  const history = useFamilyEntryHistory(family, transactionId);
  const detail = useFamily(family).data;
  const events = history.data ?? [];
  return (
    <>
      {history.isPending && <p className="family-entry-muted">Loading…</p>}
      {history.isError && (
        <p className="form-error" role="alert">
          {history.error.message}
        </p>
      )}
      {history.isSuccess && events.length === 0 && (
        <p className="family-entry-muted">No changes since it was added.</p>
      )}
      {events.length > 0 && (
        <ol className="family-entry-events">
          {events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <strong>
                {memberName(detail, event.userId, family.userId, true)} {ACTION_VERBS[event.action]}{" "}
                it · {formatFamilyDate(event.at)}
              </strong>
              {eventDetail(event).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
