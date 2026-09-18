import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import {
  isBillingEnforcementError,
  isUsageLimitReachedError,
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

  const usageLimit = isUsageLimitReachedError(error) ? error.details : undefined;
  const resourceLimit = isResourceLimitReachedError(error) ? error.details : undefined;
  const upgradeRequired = isUpgradeRequiredError(error) ? error.details : undefined;
  const resetLabel = usageLimit?.resetsAt ? formatManilaDate(usageLimit.resetsAt, true) : undefined;
  // A downgrade can leave usage above the new limit; "all 500" reads better than "600 of 500".
  let usageProgress = "";
  if (usageLimit) {
    usageProgress =
      usageLimit.used > usageLimit.limit
        ? `all ${usageLimit.limit}`
        : `${usageLimit.used} of ${usageLimit.limit}`;
  }

  const title = usageLimit
    ? "Monthly plan limit reached"
    : resourceLimit
      ? "Custom category limit reached"
      : "Zoption Pro is required";
  // The shared pool error carries no plan, so only the smaller pool advertises the Pro size.
  const aiUsageDescription =
    usageLimit?.feature === "ai_usage"
      ? `You’ve used ${usageProgress} AI actions this month.${
          usageLimit.limit < 2_000 ? " Pro includes 2,000 AI actions a month." : ""
        }`
      : undefined;
  const description = usageLimit
    ? (aiUsageDescription ??
      `You’ve used ${usageProgress} ${featureLabels[usageLimit.feature]} this month.`)
    : resourceLimit
      ? `You’re using ${resourceLimit.used} of ${resourceLimit.limit} active ${resourceLabels[resourceLimit.resource]}. Archive one to free the slot, or upgrade for unlimited categories.`
      : upgradeRequired
        ? `Upgrade to use ${capabilityLabels[upgradeRequired.capability]}.`
        : "Upgrade to use this paid feature.";

  return (
    <aside
      className="upgrade-prompt"
      data-tone={usageLimit || resourceLimit ? "warning" : "upgrade"}
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
