import type { BillingCapability, BillingFeature } from "@zoption/shared";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import {
  isBillingEnforcementError,
  isMonthlyLimitReachedError,
  isUpgradeRequiredError,
} from "../../lib/api";
import "./UpgradePrompt.css";

const capabilityLabels: Record<BillingCapability, string> = {
  assistant_question: "AI assistant questions",
  file_import: "file imports",
  category_management: "custom category management",
  account_management: "custom account management",
  cashflow_analytics: "cashflow analytics",
  transaction_export: "transaction exports",
};

const featureLabels: Record<BillingFeature, string> = {
  assistant_question: "AI questions",
  file_import: "file imports",
};

function formatManilaReset(value: string): string | undefined {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;

  return `${new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date)} (Asia/Manila)`;
}

export function UpgradePrompt({ error }: { error: unknown }) {
  if (!isBillingEnforcementError(error)) return null;

  const monthlyLimit = isMonthlyLimitReachedError(error) ? error.details : undefined;
  const upgradeRequired = isUpgradeRequiredError(error) ? error.details : undefined;
  const resetLabel = monthlyLimit ? formatManilaReset(monthlyLimit.resetsAt) : undefined;

  const title = monthlyLimit ? "Monthly plan limit reached" : "Zoption Pro is required";
  const description = monthlyLimit
    ? `You’ve used this month’s ${monthlyLimit.limit} ${featureLabels[monthlyLimit.feature]}.`
    : upgradeRequired
      ? `Upgrade to use ${capabilityLabels[upgradeRequired.capability]}.`
      : "Upgrade to use this paid feature.";

  return (
    <aside className="upgrade-prompt" role="alert" aria-label={title}>
      <span className="upgrade-prompt-icon" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <div className="upgrade-prompt-copy">
        <strong>{title}</strong>
        <p>
          {description}
          {resetLabel ? ` Your limit resets ${resetLabel}.` : ""}
        </p>
      </div>
      <Link className="upgrade-prompt-link" to="/app/settings">
        Plan and billing <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </aside>
  );
}
