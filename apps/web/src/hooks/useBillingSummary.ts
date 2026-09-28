// Five suites vi.mock("../src/hooks/useBillingSummary"), so components keep importing the hook
// from this path while its implementation lives with the other billing queries.
export { useBillingSummary } from "../queries/billing";
