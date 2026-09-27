// Upper bounds for user-entered money, in integer minor units (centavos). The REST schemas
// (schemas/) and the mobile sync contract (sync.ts) must reject exactly the same values, so both
// import these rather than repeating the literals.

/** ₱1,000,000,000.00: a monthly budget limit or a subscription amount. */
export const BUDGET_AND_SUBSCRIPTION_MAX_MINOR = 1_000_000_000_00;

/** ₱9,000,000,000,000.00: a savings goal target or saved amount, or a debt balance or payment. */
export const GOAL_AND_DEBT_MAX_MINOR = 900_000_000_000_000;
