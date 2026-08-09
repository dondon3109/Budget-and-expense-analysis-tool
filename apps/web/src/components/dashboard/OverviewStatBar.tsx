import type { Currency } from "@zoption/shared";
import type { LucideIcon } from "lucide-react";
import { Fragment } from "react";

import { formatMoney, formatMoneyParts } from "../../lib/formatters";

export interface OverviewStatAmount {
  amountMinor: number;
  currency: Currency;
}

export interface OverviewStatTrend {
  percentage: number;
  comparison: string;
  state: "positive" | "negative" | "neutral";
}

export interface OverviewStatItem {
  label: string;
  amounts: OverviewStatAmount[];
  detail: string;
  icon: LucideIcon;
  tone: "income" | "expense" | "ink" | "plum";
  trend?: OverviewStatTrend;
}

interface OverviewStatBarProps {
  items: OverviewStatItem[];
}

const CURRENCY_PREFERENCE: Currency[] = ["PHP", "USD"];
const percentageFormatter = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });

function formatPercentageChange(percentage: number): string {
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentageFormatter.format(percentage)}%`;
}

export function OverviewStatBar({ items }: OverviewStatBarProps) {
  return (
    <section className="overview-stat-bar" aria-label="Monthly summary">
      {items.map((item) => {
        const Icon = item.icon;
        const orderedAmounts = CURRENCY_PREFERENCE.map((currency) =>
          item.amounts.find((amount) => amount.currency === currency),
        ).filter((amount): amount is OverviewStatAmount => amount !== undefined);
        const primary = orderedAmounts[0];
        const secondary = orderedAmounts.slice(1);

        return (
          <article className={`overview-stat tone-${item.tone}`} key={item.label}>
            <div className="overview-stat-heading">
              <span>{item.label}</span>
              <span className="overview-stat-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
            </div>
            {primary && (
              <strong>
                {formatMoneyParts(primary.amountMinor, primary.currency).map((part, index) =>
                  part.type === "currency" ? (
                    <span className="overview-stat-currency" key={`${part.type}-${index}`}>
                      {part.value}
                    </span>
                  ) : (
                    <Fragment key={`${part.type}-${index}`}>{part.value}</Fragment>
                  ),
                )}
              </strong>
            )}
            {secondary.length > 0 && (
              <div className="overview-stat-secondary">
                {secondary.map((amount) => (
                  <span key={amount.currency}>
                    {formatMoney(amount.amountMinor, amount.currency)}
                    <em>{amount.currency}</em>
                  </span>
                ))}
              </div>
            )}
            {item.trend && (
              <div className="overview-stat-trend" data-state={item.trend.state}>
                <span>{formatPercentageChange(item.trend.percentage)}</span>
                <small>{item.trend.comparison}</small>
              </div>
            )}
            <p>{item.detail}</p>
          </article>
        );
      })}
    </section>
  );
}
