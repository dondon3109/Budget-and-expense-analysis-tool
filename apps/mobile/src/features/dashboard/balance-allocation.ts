import type { AccountBalanceSummaryItem, Currency } from "@zoption/shared";

export interface AllocationSlice {
  id: string;
  name: string;
  balanceMinor: number;
  sharePercent: number;
}

export interface BalanceAllocation {
  /**
   * Positive workspace-currency balances, largest first. Shares are of `assetsMinor`, not the
   * headline total, which is net of debt; they sum to about 100.
   */
  slices: AllocationSlice[];
  assetsMinor: number;
  /** Sum of negative workspace-currency balances (credit cards and overdrawn accounts), zero or below. */
  liabilitiesMinor: number;
}

/**
 * Splits the workspace-currency total into what each account holds. Only accounts in
 * that currency count because the headline total is in it; other balances are shown beside it, never
 * converted. Archived accounts are excluded so the bar matches the accounts a
 * user can still spend from.
 */
export function balanceAllocation(
  items: readonly AccountBalanceSummaryItem[],
  currency: Currency = "PHP",
): BalanceAllocation {
  const active = items.filter((item) => !item.archived && item.currency === currency);
  const assetsMinor = active.reduce((sum, item) => sum + Math.max(0, item.balanceMinor), 0);
  const liabilitiesMinor = active.reduce((sum, item) => sum + Math.min(0, item.balanceMinor), 0);
  const slices = active
    .filter((item) => item.balanceMinor > 0)
    .sort((left, right) => right.balanceMinor - left.balanceMinor)
    .map((item) => ({
      id: item.id,
      name: item.name,
      balanceMinor: item.balanceMinor,
      sharePercent: Math.round((item.balanceMinor / assetsMinor) * 100),
    }));
  return { slices, assetsMinor, liabilitiesMinor };
}
