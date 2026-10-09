import "./BudgetScopes.css";

export type BudgetTab = "month" | "every-month" | "occasions";

const TABS: { id: BudgetTab; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "every-month", label: "Every month" },
  { id: "occasions", label: "Occasions" },
];

/** Chooses which plan the page edits: one month, the every-month defaults, or an occasion. */
export function BudgetScopeTabs({
  value,
  onChange,
}: {
  value: BudgetTab;
  onChange: (tab: BudgetTab) => void;
}) {
  return (
    <div className="budget-scope-tabs" role="tablist" aria-label="Budget type">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          className={tab.id === value ? "active" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
