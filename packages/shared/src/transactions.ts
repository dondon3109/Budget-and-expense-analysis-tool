import type { AccountType } from "./types";

/** New entries prefer cash while preserving a usable fallback for workspaces without one. */
export function preferredTransactionAccount<Account extends { type: AccountType }>(
  accounts: readonly Account[],
): Account | undefined {
  return accounts.find((account) => account.type === "cash") ?? accounts[0];
}
