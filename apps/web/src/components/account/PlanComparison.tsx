import { TIER_NAMES, billingTiers, type BillingTier } from "@zoption/shared";

import { planFeatures } from "../billing/billingPlans";

/** Free, Budget, and Pro side by side, marking the tier in effect once it is known. */
export function PlanComparison({ current }: { current: BillingTier | null }) {
  return (
    <section id="plan-comparison" className="settings-section billing-plan-comparison-section">
      <div className="billing-plan-comparison-wrap">
        <div className="billing-plan-comparison-heading">
          <div>
            <h2 id="billing-plan-comparison-title">Free, Budget, and Pro, side by side</h2>
            <p id="billing-plan-comparison-description">
              Transactions, budgets, recurring-expense tracking, calendar tools, and included
              starter data remain available on every plan.
            </p>
          </div>
        </div>
        <p id="billing-plan-scroll-hint" className="billing-plan-scroll-hint">
          On narrow screens, each feature keeps every plan together.
        </p>
        <div
          className="billing-plan-table-wrap"
          role="region"
          aria-labelledby="billing-plan-comparison-title"
          aria-describedby="billing-plan-comparison-description billing-plan-scroll-hint"
          tabIndex={0}
        >
          <table className="billing-plan-comparison">
            <caption className="sr-only">Free, Zoption Budget, and Zoption Pro features</caption>
            <thead>
              <tr>
                <th className="billing-plan-feature-heading" scope="col">
                  Feature
                </th>
                {billingTiers.map((tier) => (
                  <th
                    key={tier}
                    scope="col"
                    data-plan={tierKey(tier)}
                    data-current={current === tier || undefined}
                    aria-current={current === tier ? "true" : undefined}
                  >
                    <span className="billing-plan-name">{TIER_NAMES[tier]}</span>
                    {current === tier && <span className="billing-plan-current">Current plan</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planFeatures.map((item) => (
                <tr key={item.feature}>
                  <th scope="row">{item.feature}</th>
                  {billingTiers.map((tier) => (
                    <td
                      key={tier}
                      data-plan={tierKey(tier)}
                      data-plan-label={TIER_NAMES[tier]}
                      data-current={current === tier || undefined}
                    >
                      {item[tier]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** The stylesheet's `data-plan` names: free, budget, pro. */
function tierKey(tier: BillingTier): string {
  return tier === "free" ? "free" : tier.replace("zoption_", "");
}
