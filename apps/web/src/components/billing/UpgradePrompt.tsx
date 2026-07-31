import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import {
  isBillingEnforcementError,
  isMonthlyLimitReachedError,
  isResourceLimitReachedError,
  isUpgradeRequiredError,
} from "../../lib/api";
import {
  capabilityLabels,
  featureLabels,
  formatManilaDate,
  resourceLabels,
} from "./billingPresentation";
import "./UpgradePrompt.css";

export function UpgradePrompt({ error }: { error: unknown }) {
  if (!isBillingEnforcementError(error)) return null;

  const monthlyLimit = isMonthlyLimitReachedError(error) ? error.details : undefined;
  const resourceLimit = isResourceLimitReachedError(error) ? error.details : undefined;
  const upgradeRequired = isUpgradeRequiredError(error) ? error.details : undefined;
  const resetLabel = monthlyLimit ? formatManilaDate(monthlyLimit.resetsAt, true) : undefined;

  const title = monthlyLimit
    ? "Monthly plan limit reached"
    : resourceLimit
      ? "Custom category limit reached"
      : "Zoption Pro is required";
  const description = monthlyLimit
    ? `You’ve used ${monthlyLimit.used} of ${monthlyLimit.limit} ${featureLabels[monthlyLimit.feature]} this month.`
    : resourceLimit
      ? `You’re using ${resourceLimit.used} of ${resourceLimit.limit} active ${resourceLabels[resourceLimit.resource]}. Archive one to free the slot, or upgrade for unlimited categories.`
      : upgradeRequired
        ? `Upgrade to use ${capabilityLabels[upgradeRequired.capability]}.`
        : "Upgrade to use this paid feature.";

  return (
    <aside
      className="upgrade-prompt"
      data-tone={monthlyLimit || resourceLimit ? "warning" : "upgrade"}
      role="alert"
      aria-label={title}
    >
      <span className="upgrade-prompt-icon" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <div className="upgrade-prompt-copy">
        <strong>{title}</strong>
        <p>
          {description}
          {resetLabel ? ` Your limit resets ${resetLabel} (Asia/Manila).` : ""}
        </p>
      </div>
      <Link className="upgrade-prompt-link" to="/app/settings#plan-and-billing">
        Plan and billing <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </aside>
  );
}
