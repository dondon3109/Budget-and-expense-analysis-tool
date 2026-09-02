import { decodeSharedBudgetToken, type DecodeShareTokenResult } from "@zoption/shared";
import { AlertTriangle, ArrowRight, LockKeyhole, WalletCards } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { formatFullMonth, formatMoney } from "../../lib/formatters";
import "./SharedBudgetPage.css";

interface SharedBudgetPageProps {
  token?: string;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatSharedMonth(month: string): string {
  return /^\d{4}-\d{2}$/u.test(month) ? formatFullMonth(month) : month;
}

function errorMessage(error: DecodeShareTokenResult["error"]): string {
  switch (error) {
    case "expired":
      return "This shared budget link has expired. Ask the owner to generate a new read-only link.";
    case "invalid_signature":
      return "This shared budget link appears to have been changed and cannot be opened safely.";
    case "unsupported_version":
      return "This shared budget link was created by an unsupported version of Zoption.";
    default:
      return "This shared budget link is invalid or incomplete. Check that the full link was copied.";
  }
}

export function SharedBudgetPage({ token: tokenProp }: SharedBudgetPageProps) {
  const params = useParams<{ token: string }>();
  const token = tokenProp ?? params.token ?? "";
  const result = decodeSharedBudgetToken(token);

  if (!result.valid || !result.payload) {
    return (
      <main className="shared-budget-page shared-budget-error-page">
        <section className="shared-budget-error-card" role="alert" aria-labelledby="shared-budget-error-title">
          <AlertTriangle size={28} aria-hidden="true" />
          <p className="shared-budget-eyebrow">Link unavailable</p>
          <h1 id="shared-budget-error-title">We could not open this shared budget</h1>
          <p>{errorMessage(result.error)}</p>
          <Link className="shared-budget-button" to="/">
            Go to Zoption
          </Link>
        </section>
      </main>
    );
  }

  const { payload } = result;
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;

  return (
    <main className="shared-budget-page">
      <section className="shared-budget-hero" aria-labelledby="shared-budget-title">
        <div>
          <p className="shared-budget-eyebrow">Shared family budget</p>
          <h1 id="shared-budget-title">{payload.title}</h1>
          <dl className="shared-budget-meta">
            <div>
              <dt>Month</dt>
              <dd>{formatSharedMonth(payload.month)}</dd>
            </div>
            {payload.ownerDisplayName && (
              <div>
                <dt>Shared by</dt>
                <dd>{payload.ownerDisplayName}</dd>
              </div>
            )}
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(payload.createdAt)}</dd>
            </div>
          </dl>
          {payload.notes && <p className="shared-budget-notes">{payload.notes}</p>}
        </div>
        <aside className="shared-budget-privacy-note" aria-label="Privacy assurance">
          <LockKeyhole size={22} aria-hidden="true" />
          <p>
            This is a secure, read-only budget snapshot. Personal bank details, account balances,
            and individual transactions are never shared.
          </p>
        </aside>
      </section>

      {expiresAt && (
        <p className="shared-budget-expiration" role="status">
          This link expires {formatDateTime(payload.expiresAt!)}.
        </p>
      )}

      <section className="shared-budget-stats" aria-label="Shared budget summary">
        <article>
          <span>Total Envelope Budget</span>
          <strong>{formatMoney(payload.totalAllocatedMinor, payload.currency)}</strong>
        </article>
        <article>
          <span>Total Spent</span>
          <strong>{formatMoney(payload.totalSpentMinor, payload.currency)}</strong>
        </article>
        <article>
          <span>Remaining Balance</span>
          <strong>{formatMoney(payload.totalRemainingMinor, payload.currency)}</strong>
        </article>
        <article>
          <span>Overall % Used</span>
          <strong>{payload.totalPercentUsed}%</strong>
        </article>
      </section>

      <section className="shared-budget-envelope-section" aria-labelledby="shared-budget-envelopes-title">
        <div className="shared-budget-section-heading">
          <WalletCards size={20} aria-hidden="true" />
          <div>
            <h2 id="shared-budget-envelopes-title">Included envelopes</h2>
            <p>{payload.envelopes.length} read-only envelope snapshots</p>
          </div>
        </div>
        <div className="shared-budget-envelope-list">
          {payload.envelopes.map((envelope) => {
            const progress = Math.min(Math.max(envelope.percentUsed, 0), 100);
            return (
              <article className="shared-budget-envelope-card" key={envelope.categoryId}>
                <div className="shared-budget-envelope-heading">
                  <span className="shared-budget-category-dot" style={{ background: envelope.categoryColor }} />
                  <div>
                    <h3>{envelope.categoryName}</h3>
                    <p>{envelope.percentUsed}% used</p>
                  </div>
                </div>
                <div
                  className="shared-budget-progress"
                  role="progressbar"
                  aria-label={`${envelope.categoryName} budget used`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span style={{ width: `${progress}%`, background: envelope.categoryColor }} />
                </div>
                <dl className="shared-budget-envelope-values">
                  <div>
                    <dt>Allocated</dt>
                    <dd>{formatMoney(envelope.allocatedLimitMinor, payload.currency)}</dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>{formatMoney(envelope.spentMinor, payload.currency)}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{formatMoney(envelope.remainingMinor, payload.currency)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="shared-budget-footer">
        <div>
          <strong>Zoption</strong>
          <p>Simple budget visibility without sharing private banking details.</p>
        </div>
        <Link className="shared-budget-button" to="/signup">
          Start your own budget <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
