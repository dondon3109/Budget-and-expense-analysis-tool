import {
  isSubscriptionUsageTracked,
  SUBSCRIPTION_IDLE_DAYS,
  subscriptionRoi,
  type SubscriptionMonthItem,
  type SubscriptionRoi,
  type SubscriptionUsageList,
} from "@zoption/shared";
import { Check, Flame, Gauge, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { formatMoney } from "../../lib/formatters";
import "./SubscriptionRoiPanel.css";

interface SubscriptionRoiPanelProps {
  /** Pro or Family Pro; other plans see what the panel would show and how to get it. */
  isPro: boolean;
  items: SubscriptionMonthItem[];
  usage: SubscriptionUsageList | undefined;
  today: string;
  /** The subscription whose check-in or tracking switch is being saved. */
  savingId?: string;
  error?: string;
  onCheckIn: (id: string) => void;
  onUndo: (id: string) => void;
  onCancel: (id: string) => void;
  onTrack: (id: string, tracked: boolean) => void;
}

function statusLabel(roi: SubscriptionRoi): string {
  if (roi.status === "untracked") return "No check-ins yet";
  if (roi.status === "idle") return `Unused for ${roi.daysSinceLastUse} days`;
  if (roi.daysSinceLastUse === 0) return "Used today";
  if (roi.daysSinceLastUse === 1) return "Used yesterday";
  return `Used ${roi.daysSinceLastUse} days ago`;
}

/**
 * Subscription ROI: a "Used it" check-in per subscription per day, what each use cost this
 * cycle, and a cancel prompt once a tracked subscription sits unused for 30 days. Only bills with
 * "Track usage" on get rows; rent and utilities start off, so nobody marks "Used it" for water.
 */
export function SubscriptionRoiPanel({
  isPro,
  items,
  usage,
  today,
  savingId,
  error,
  onCheckIn,
  onUndo,
  onCancel,
  onTrack,
}: SubscriptionRoiPanelProps) {
  const active = items.filter((item) => item.status === "active");
  if (active.length === 0) return null;

  if (!isPro) {
    return (
      <section className="subscription-roi subscription-roi-teaser" aria-label="Usage and value">
        <div className="subscription-roi-heading-main">
          <span className="subscription-roi-icon" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div>
            <h2 className="subscription-roi-title">Are your subscriptions worth it?</h2>
            <p className="subscription-roi-subtitle">
              With Zoption Pro, mark “Used it” whenever you use a service to see what each use
              really costs, and get flagged before an unused one renews.
            </p>
          </div>
        </div>
        <Link className="button secondary compact" to="/app/settings">
          See Pro
        </Link>
      </section>
    );
  }

  const usedOnById = new Map(usage?.usage.map((row) => [row.subscriptionId, row.usedOn]));
  const trackedById = new Map(usage?.tracking.map((row) => [row.subscriptionId, row.tracked]));
  const tracked = active.filter((item) =>
    isSubscriptionUsageTracked(item.name, trackedById.get(item.id)),
  );
  const untracked = active.filter((item) => !tracked.includes(item));
  const rows = tracked.map((item) => ({
    item,
    roi: subscriptionRoi(item, usedOnById.get(item.id) ?? [], today),
  }));
  const idleCount = rows.filter(({ roi }) => roi.status === "idle").length;

  return (
    <section className="subscription-roi" aria-label="Usage and value">
      <header className="subscription-roi-header">
        <div className="subscription-roi-heading-main">
          <span className="subscription-roi-icon" aria-hidden="true">
            <Gauge size={16} />
          </span>
          <div>
            <h2 className="subscription-roi-title">Usage and value</h2>
            <p className="subscription-roi-subtitle">
              {rows.length > 0
                ? `Mark “Used it” when you use a service. Unused for ${SUBSCRIPTION_IDLE_DAYS} days, it gets flagged before it renews.`
                : `Pick a bill below to track cost per use. Unused for ${SUBSCRIPTION_IDLE_DAYS} days, it gets flagged before it renews.`}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="subscription-roi-meta">
            <span className="subscription-roi-count">{rows.length} tracked</span>
            {idleCount > 0 && (
              <span className="subscription-roi-count idle">
                {idleCount} unused {SUBSCRIPTION_IDLE_DAYS}+ days
              </span>
            )}
          </div>
        )}
      </header>
      {error && (
        <p className="subscription-roi-error" role="alert">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="subscription-roi-list">
          {rows.map(({ item, roi }) => (
            <li
              key={item.id}
              className={`subscription-roi-row ${roi.status === "idle" ? "idle" : ""}`}
            >
              <div className="subscription-roi-name">
                <strong>{item.name}</strong>
                <span className={`subscription-roi-status ${roi.status}`}>{statusLabel(roi)}</span>
              </div>
              <dl className="subscription-roi-stats">
                <div>
                  <dt>Uses this cycle</dt>
                  <dd className={roi.usesThisCycle === 0 ? "is-muted" : undefined}>
                    {roi.usesThisCycle}
                  </dd>
                </div>
                <div>
                  <dt>Cost per use</dt>
                  <dd className={roi.costPerUseMinor === null ? "is-muted" : undefined}>
                    {roi.costPerUseMinor === null
                      ? "—"
                      : formatMoney(roi.costPerUseMinor, item.currency)}
                  </dd>
                </div>
                <div>
                  <dt>Streak</dt>
                  <dd className={roi.weekStreak === 0 ? "is-muted" : undefined}>
                    {roi.weekStreak > 0 && <Flame size={13} aria-hidden="true" />}
                    {roi.weekStreak} wk
                  </dd>
                </div>
              </dl>
              <div className="subscription-roi-actions">
                <button
                  className="subscription-roi-untrack"
                  type="button"
                  disabled={savingId === item.id}
                  aria-label={`Stop tracking ${item.name}`}
                  onClick={() => onTrack(item.id, false)}
                >
                  Stop tracking
                </button>
                {roi.status === "idle" && (
                  <button
                    className="subscription-roi-cancel"
                    type="button"
                    onClick={() => onCancel(item.id)}
                  >
                    Cancel it
                  </button>
                )}
                {roi.usedToday ? (
                  <button
                    className="button secondary subscription-roi-checkin subscription-roi-used"
                    type="button"
                    disabled={savingId === item.id}
                    aria-label={`Undo today's check-in for ${item.name}`}
                    onClick={() => onUndo(item.id)}
                  >
                    <Check size={14} aria-hidden="true" /> Undo
                  </button>
                ) : (
                  <button
                    className="button primary subscription-roi-checkin"
                    type="button"
                    disabled={savingId === item.id}
                    aria-label={`I used ${item.name} today`}
                    onClick={() => onCheckIn(item.id)}
                  >
                    Used it
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {untracked.length > 0 && (
        <div className="subscription-roi-untracked">
          <span className="subscription-roi-untracked-label">
            {rows.length === 0 ? "Track usage" : "Not tracked"}
          </span>
          <div className="subscription-roi-untracked-list">
            {untracked.map((item) => (
              <button
                key={item.id}
                className="subscription-roi-track-chip"
                type="button"
                disabled={savingId === item.id}
                aria-label={`Track ${item.name}`}
                onClick={() => onTrack(item.id, true)}
              >
                <Plus size={14} aria-hidden="true" />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
