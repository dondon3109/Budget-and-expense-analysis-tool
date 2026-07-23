import type { LucideIcon } from "lucide-react";
import { Fragment } from "react";

import { formatMoneyParts } from "../../lib/formatters";

export interface OverviewStatItem {
  label: string;
  amountMinor: number;
  detail: string;
  icon: LucideIcon;
  tone: "income" | "expense" | "ink" | "plum";
}

interface OverviewStatBarProps {
  items: OverviewStatItem[];
}

export function OverviewStatBar({ items }: OverviewStatBarProps) {
  return (
    <section className="overview-stat-bar" aria-label="Monthly summary">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article className={`overview-stat tone-${item.tone}`} key={item.label}>
            <div className="overview-stat-heading">
              <span>{item.label}</span>
              <span className="overview-stat-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
            </div>
            <strong>
              {formatMoneyParts(item.amountMinor).map((part, index) =>
                part.type === "currency" ? (
                  <span className="overview-stat-currency" key={`${part.type}-${index}`}>
                    {part.value}
                  </span>
                ) : (
                  <Fragment key={`${part.type}-${index}`}>{part.value}</Fragment>
                ),
              )}
            </strong>
            <p>{item.detail}</p>
          </article>
        );
      })}
    </section>
  );
}
