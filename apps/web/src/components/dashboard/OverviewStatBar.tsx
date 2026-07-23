import type { LucideIcon } from "lucide-react";

export interface OverviewStatItem {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "sage" | "amber" | "ink" | "plum";
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
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        );
      })}
    </section>
  );
}
