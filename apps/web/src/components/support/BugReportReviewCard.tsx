import type { BugReportDiagnostics, BugReportDraft } from "@zoption/shared";
import { CheckCircle2, FileWarning, ShieldCheck, X } from "lucide-react";

interface BugReportReviewCardProps {
  draft: BugReportDraft;
  diagnostics: BugReportDiagnostics;
  busy: boolean;
  error?: string;
  onChange: (draft: BugReportDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: BugReportDraft["category"]; label: string }> = [
  { value: "ui", label: "Interface" },
  { value: "data", label: "Data or calculations" },
  { value: "import", label: "File import" },
  { value: "billing", label: "Plan or billing" },
  { value: "authentication", label: "Sign in or account" },
  { value: "performance", label: "Speed or reliability" },
  { value: "other", label: "Something else" },
];

const FREQUENCY_OPTIONS: Array<{ value: BugReportDraft["frequency"]; label: string }> = [
  { value: "always", label: "Every time" },
  { value: "sometimes", label: "Sometimes" },
  { value: "once", label: "Only once" },
  { value: "unknown", label: "Not sure" },
];

function complete(draft: BugReportDraft): boolean {
  return (
    draft.title.trim().length >= 5 &&
    draft.actualBehavior.trim().length >= 5 &&
    draft.expectedBehavior.trim().length >= 5 &&
    draft.stepsToReproduce.trim().length >= 5
  );
}

export function BugReportReviewCard({
  draft,
  diagnostics,
  busy,
  error,
  onChange,
  onSubmit,
  onCancel,
}: BugReportReviewCardProps) {
  function update<K extends keyof BugReportDraft>(key: K, value: BugReportDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <section className="support-report-review" aria-labelledby="support-report-review-title">
      <div className="support-report-review-heading">
        <span aria-hidden="true">
          <FileWarning size={17} />
        </span>
        <div>
          <p>Review before sending</p>
          <h3 id="support-report-review-title">Bug report draft</h3>
        </div>
        <button type="button" onClick={onCancel} aria-label="Discard bug report draft">
          <X size={17} />
        </button>
      </div>

      <p className="support-report-review-note">
        Nothing is saved yet. Check the wording and remove financial or sensitive information.
      </p>

      <div className="support-report-fields">
        <label>
          <span>Short title</span>
          <input
            value={draft.title}
            maxLength={120}
            disabled={busy}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>

        <div className="support-report-field-row">
          <label>
            <span>Area</span>
            <select
              value={draft.category}
              disabled={busy}
              onChange={(event) =>
                update("category", event.target.value as BugReportDraft["category"])
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>How often?</span>
            <select
              value={draft.frequency}
              disabled={busy}
              onChange={(event) =>
                update("frequency", event.target.value as BugReportDraft["frequency"])
              }
            >
              {FREQUENCY_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>What happened?</span>
          <textarea
            rows={3}
            maxLength={2_000}
            value={draft.actualBehavior}
            disabled={busy}
            onChange={(event) => update("actualBehavior", event.target.value)}
          />
        </label>
        <label>
          <span>What should have happened?</span>
          <textarea
            rows={3}
            maxLength={2_000}
            value={draft.expectedBehavior}
            disabled={busy}
            onChange={(event) => update("expectedBehavior", event.target.value)}
          />
        </label>
        <label>
          <span>Steps to reproduce</span>
          <textarea
            rows={3}
            maxLength={2_000}
            value={draft.stepsToReproduce}
            disabled={busy}
            onChange={(event) => update("stepsToReproduce", event.target.value)}
          />
        </label>
      </div>

      <details className="support-report-diagnostics">
        <summary>
          <ShieldCheck size={14} aria-hidden="true" /> Safe diagnostics included
        </summary>
        <p>
          {diagnostics.route} · Zoption {diagnostics.releaseVersion} · {diagnostics.platform} ·{" "}
          {diagnostics.displayMode} · {diagnostics.viewportWidth}×{diagnostics.viewportHeight}
        </p>
        <p>No financial records, credentials, console logs, or network contents are attached.</p>
      </details>

      {error && (
        <p className="support-report-submit-error" role="alert">
          {error}
        </p>
      )}

      <div className="support-report-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          Keep chatting
        </button>
        <button type="button" disabled={busy || !complete(draft)} onClick={onSubmit}>
          <CheckCircle2 size={15} aria-hidden="true" />
          {busy ? "Submitting…" : "Submit bug report"}
        </button>
      </div>
    </section>
  );
}
