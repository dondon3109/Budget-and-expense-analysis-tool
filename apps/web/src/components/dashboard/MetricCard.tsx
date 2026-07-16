import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "sage" | "ink" | "amber" | "plum";
}

export function MetricCard({ label, value, detail, icon: Icon, tone }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-heading">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
