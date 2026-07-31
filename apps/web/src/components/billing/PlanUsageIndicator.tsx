import { Link } from "react-router-dom";

import { formatManilaDate } from "./billingPresentation";
import "./PlanUsageIndicator.css";

interface PlanUsageIndicatorProps {
  label: string;
  used: number;
  limit: number | null;
  resetsAt?: string;
  compact?: boolean;
  detail?: string;
  showUpgrade?: boolean;
}

export function PlanUsageIndicator({
  label,
  used,
  limit,
  resetsAt,
  compact = false,
  detail,
  showUpgrade = false,
}: PlanUsageIndicatorProps) {
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const exhausted = limit !== null && used >= limit;
  const nearLimit =
    limit !== null &&
    used > 0 &&
    !exhausted &&
    remaining !== null &&
    remaining <= Math.max(1, Math.ceil(limit * 0.2));
  const state = limit === null ? "unlimited" : exhausted ? "exhausted" : nearLimit ? "warning" : "normal";
  const reset = resetsAt ? formatManilaDate(resetsAt) : undefined;

  return (
    <div
      className={`plan-usage-indicator${compact ? " compact" : ""}`}
      data-state={state}
      {...(limit === null
        ? {}
        : {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": limit,
            "aria-valuenow": Math.min(used, limit),
          })}
    >
      <div className="plan-usage-heading">
        <span>{label}</span>
        <strong>{limit === null ? "Unlimited" : `${used} / ${limit}`}</strong>
      </div>
      {!compact && limit !== null && (
        <span className="plan-usage-track" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
        </span>
      )}
      <div className="plan-usage-meta">
        <small>
          {limit === null
            ? detail || "No category limit on Zoption Pro"
            : exhausted
              ? `Limit reached${reset ? ` · resets ${reset}` : ""}`
              : `${remaining} remaining${reset ? ` · resets ${reset}` : ""}`}
        </small>
        {showUpgrade && limit !== null && (nearLimit || exhausted) && (
          <Link to="/app/settings#plan-and-billing">View Pro limits</Link>
        )}
      </div>
      {detail && limit !== null && !compact && <p>{detail}</p>}
    </div>
  );
}
