import { otherCurrenciesWithAmounts, type Currency, type CurrencyTotals } from "@zoption/shared";
import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { formatMoney, formatMoneyParts } from "../../lib/formatters";

export interface OverviewStatAmount {
  amountMinor: number;
  currency: Currency;
}

/** The workspace-currency total first (even when zero), then each other non-zero currency. */
export function amountsLeadingWith(totals: CurrencyTotals, base: Currency): OverviewStatAmount[] {
  return [base, ...otherCurrenciesWithAmounts(totals, base)].map((currency) => ({
    amountMinor: totals[currency] ?? 0,
    currency,
  }));
}

export interface OverviewStatTrend {
  percentage: number;
  comparison: string;
  state: "positive" | "negative" | "neutral";
}

export interface OverviewStatItem {
  label: string;
  amounts: OverviewStatAmount[];
  icon: LucideIcon;
  tone: "income" | "expense" | "ink" | "plum";
  trend?: OverviewStatTrend;
}

const percentageFormatter = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 });

function formatPercentageChange(percentage: number): string {
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentageFormatter.format(percentage)}%`;
}

/** A cell's headline amount, with the currency sign set in the UI font. */
export function OverviewStatValue({ amountMinor, currency }: OverviewStatAmount) {
  return (
    <strong>
      {formatMoneyParts(amountMinor, currency).map((part, index) =>
        part.type === "currency" ? (
          <span className="overview-stat-currency" key={`${part.type}-${index}`}>
            {part.value}
          </span>
        ) : (
          <Fragment key={`${part.type}-${index}`}>{part.value}</Fragment>
        ),
      )}
    </strong>
  );
}

/** The summary row; callers compose `OverviewStat` cells with any custom cell between them. */
export function OverviewStatBar({ children }: { children: ReactNode }) {
  return (
    <section className="overview-stat-bar" aria-label="Monthly summary">
      {children}
    </section>
  );
}

export function OverviewStat({ item }: { item: OverviewStatItem }) {
  const Icon = item.icon;
  // Callers list the workspace currency first.
  const primary = item.amounts[0];
  const secondary = item.amounts.slice(1);

  return (
    <article className={`overview-stat tone-${item.tone}`}>
      <div className="overview-stat-heading">
        <span>{item.label}</span>
        <span className="overview-stat-icon">
          <Icon size={16} aria-hidden="true" />
        </span>
      </div>
      {primary && (
        <OverviewStatValue amountMinor={primary.amountMinor} currency={primary.currency} />
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
    </article>
  );
}
