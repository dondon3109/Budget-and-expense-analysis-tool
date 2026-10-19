// The PayPal catalog both setup scripts reconcile: one product holding every plan, since PayPal
// revises a subscription only between plans of the same product. Prices are whole pesos and must
// match PLAN_PRICES_MINOR in packages/shared/src/plans.ts (pinned by paypal-plans.test.mjs).

export const PAYPAL_PRODUCT = {
  name: "Zoption",
  type: "SERVICE",
  category: "SOFTWARE",
  description: "Zoption subscription plans",
};

const CATALOG = [
  { plan: "BUDGET", name: "Zoption Budget", monthly: "149", annual: "1490" },
  { plan: "PRO", name: "Zoption Pro", monthly: "249", annual: "2490" },
  { plan: "FAMILY_BUDGET", name: "Family Budget", monthly: "499", annual: "4990" },
  { plan: "FAMILY_PRO", name: "Family Pro", monthly: "799", annual: "7990" },
];

/** One entry per plan and interval, keyed by the Worker variable that holds its id. */
export const PAYPAL_PLANS = CATALOG.flatMap(({ plan, name, monthly, annual }) => [
  {
    variable: `PAYPAL_${plan}_MONTHLY_PLAN_ID`,
    name: `${name} Monthly`,
    intervalUnit: "MONTH",
    fixedPrice: monthly,
  },
  {
    variable: `PAYPAL_${plan}_ANNUAL_PLAN_ID`,
    name: `${name} Annual`,
    intervalUnit: "YEAR",
    fixedPrice: annual,
  },
]);
