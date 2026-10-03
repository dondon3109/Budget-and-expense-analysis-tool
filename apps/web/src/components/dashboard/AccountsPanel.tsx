import {
  currencies,
  currencyMetadata,
  otherCurrenciesWithAmounts,
  parseAmountToMinor,
  preferredTransactionAccount,
  type AccountBalanceSummaryItem,
  type AccountInput,
  type Currency,
  type DashboardSummary,
} from "@zoption/shared";
import { Pencil, Plus, SlidersHorizontal, Star, Trash2, WalletCards } from "lucide-react";

import type { AccountMutations } from "./useAccountMutations";
import { isBillingEnforcementError } from "../../lib/api";
import { trendState } from "../../lib/dashboard";
import {
  setDefaultSpendingAccountId,
  useDefaultSpendingAccountId,
} from "../../lib/defaultSpendingAccount";
import { formatMoney } from "../../lib/formatters";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { AccountFormModal } from "./AccountFormModal";
import { accountTypeLabel, accountTypes } from "./accountTypes";

interface AccountsPanelProps {
  accounts: AccountMutations;
  accountBalances: DashboardSummary["accountBalances"];
  activeAccounts: AccountBalanceSummaryItem[];
  previousMetrics: DashboardSummary["metrics"] | undefined;
  netChangePercent: number;
  trendComparison: string;
  isPro: boolean;
  onAdjustBalance: (account: AccountBalanceSummaryItem) => void;
}

function parseOptionalAmount(value: string): number | undefined | null {
  if (!value.trim()) return undefined;
  try {
    return parseAmountToMinor(value);
  } catch {
    return null;
  }
}

/**
 * The overall balance and the account list with its add form, plus the edit and remove dialogs
 * the list opens. Styles live in AccountsPanel.css, which DashboardPage imports right after its
 * own stylesheet to keep the cascade order.
 */
export function AccountsPanel({
  accounts,
  accountBalances,
  activeAccounts,
  previousMetrics,
  netChangePercent,
  trendComparison,
  isPro,
  onAdjustBalance,
}: AccountsPanelProps) {
  const {
    isAddingAccount,
    setIsAddingAccount,
    accountName,
    setAccountName,
    accountType,
    setAccountType,
    accountCurrency,
    setAccountCurrency,
    accountStartingBalance,
    setAccountStartingBalance,
    editingAccount,
    setEditingAccount,
    setEditName,
    setEditType,
    setInterestEnabled,
    setInterestRate,
    setInterestFrequency,
    setInterestPayDay,
    removingAccount,
    setRemovingAccount,
    createAccountMutation,
    updateAccountMutation,
    removeAccountMutation,
  } = accounts;
  const defaultSpendingAccountId = useDefaultSpendingAccountId();
  const defaultSpendingAccount = preferredTransactionAccount(
    activeAccounts,
    defaultSpendingAccountId,
  );
  // Blank means no starting balance; text that is not an amount blocks the add.
  const startingBalanceMinor = parseOptionalAmount(accountStartingBalance);
  const accountActionError = updateAccountMutation.error ?? removeAccountMutation.error;
  // Balances lead with the workspace currency; other currencies show only when they are used.
  const baseCurrency: Currency = accountBalances?.currency ?? "PHP";
  const overallBalanceMinor = accountBalances?.balancesByCurrency[baseCurrency] ?? 0;
  const otherBalanceCurrencies = accountBalances
    ? otherCurrenciesWithAmounts(accountBalances.balancesByCurrency, baseCurrency)
    : [];
  const removalCurrency = removingAccount?.currency ?? baseCurrency;
  const removalBalanceMinor = removingAccount?.balancesByCurrency[removalCurrency] ?? 0;
  // A removed account stops being charged, so say which plans that affects before it happens.
  const linkedSubscriptions = removingAccount?.activeSubscriptions ?? [];
  const linkedSubscriptionWarning =
    linkedSubscriptions.length === 1
      ? `The active subscription ${linkedSubscriptions[0]} is paid from this account. It stops being charged once the account is removed, and Zoption emails you until you choose another account for it.`
      : linkedSubscriptions.length > 1
        ? `The active subscriptions ${linkedSubscriptions.join(", ")} are paid from this account. They stop being charged once the account is removed, and Zoption emails you until you choose another account for each.`
        : null;

  return (
    <>
      {accountBalances && (
        <div className="dashboard-balance">
          <section className="dashboard-balance-total" aria-labelledby="dashboard-balance-title">
            <div className="dashboard-balance-heading">
              <span className="dashboard-balance-icon" aria-hidden="true">
                <WalletCards size={19} />
              </span>
              <div>
                <p>All accounts</p>
                <h2 id="dashboard-balance-title">Overall balance</h2>
              </div>
            </div>
            <strong>{formatMoney(overallBalanceMinor, baseCurrency)}</strong>
            {previousMetrics && (
              <div className="dashboard-balance-trend" data-state={trendState(netChangePercent)}>
                <span>
                  {netChangePercent > 0 ? "+" : ""}
                  {netChangePercent}%
                </span>
                <small>net cash flow {trendComparison}</small>
              </div>
            )}
            <span>Calculated from your recorded transactions</span>
            {otherBalanceCurrencies.map((currency) => (
              <p className="dashboard-balance-usd" key={currency}>
                {formatMoney(accountBalances.balancesByCurrency[currency] ?? 0, currency)} in{" "}
                {currencyMetadata[currency].plural}
              </p>
            ))}
          </section>
          <section className="dashboard-account-breakdown" aria-label="Account management">
            <div className="dashboard-account-breakdown-heading">
              <span>Account balances</span>
              <div className="dashboard-account-heading-actions">
                <button
                  className="dashboard-account-adjust-quick"
                  type="button"
                  onClick={() => activeAccounts[0] && onAdjustBalance(activeAccounts[0])}
                  disabled={activeAccounts.length === 0}
                  title="Adjust balance to match your real cash or bank amount"
                >
                  <SlidersHorizontal size={14} aria-hidden="true" /> Adjust balance
                </button>
                <button
                  className="dashboard-account-add"
                  type="button"
                  onClick={() => setIsAddingAccount((isAdding) => !isAdding)}
                  aria-expanded={isAddingAccount}
                  aria-controls="add-account-form"
                >
                  <Plus size={14} aria-hidden="true" /> {isAddingAccount ? "Close" : "Add account"}
                </button>
              </div>
            </div>
            {isAddingAccount && (
              <form
                id="add-account-form"
                className="dashboard-account-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  createAccountMutation.mutate({
                    name: accountName,
                    type: accountType,
                    currency: accountCurrency,
                    ...(startingBalanceMinor ? { startingBalanceMinor } : {}),
                  });
                }}
              >
                <label>
                  <span>Account name</span>
                  <input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    placeholder="e.g. Maya Wallet"
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  <span>Account type</span>
                  <select
                    value={accountType}
                    onChange={(event) => setAccountType(event.target.value as AccountInput["type"])}
                  >
                    {accountTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Currency</span>
                  <select
                    value={accountCurrency}
                    onChange={(event) => setAccountCurrency(event.target.value as Currency)}
                  >
                    {currencies.map((option) => (
                      <option key={option} value={option}>
                        {currencyMetadata[option].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Starting balance (optional)</span>
                  <input
                    value={accountStartingBalance}
                    onChange={(event) => setAccountStartingBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={startingBalanceMinor === null}
                  />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={createAccountMutation.isPending || startingBalanceMinor === null}
                >
                  {createAccountMutation.isPending ? "Adding…" : "Add"}
                </button>
                <UpgradePrompt error={createAccountMutation.error} />
                {createAccountMutation.error &&
                  !isBillingEnforcementError(createAccountMutation.error) && (
                    <p className="form-error" role="alert">
                      {createAccountMutation.error.message}
                    </p>
                  )}
              </form>
            )}
            <ul>
              {activeAccounts.map((account) => {
                const isDefaultBank = account.name === "Bank";
                const canEdit = !account.system || isDefaultBank;
                const canRemove = !account.system;
                const isDefaultSpending = account.id === defaultSpendingAccount?.id;
                return (
                  <li key={account.id}>
                    <div className="dashboard-account-details">
                      <span className="dashboard-account-name">
                        {account.name}
                        {isDefaultSpending && <em>Default</em>}
                      </span>
                      <span className="dashboard-account-meta">
                        {accountTypeLabel(account.type)}
                        {account.system && <em>Permanent</em>}
                      </span>
                    </div>
                    <div className="dashboard-account-value">
                      <span className="dashboard-account-actions">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              updateAccountMutation.reset();
                              setEditingAccount(account);
                              setEditName(account.name);
                              setEditType(account.type);
                              const interest =
                                account.type === "savings" ? account.interest : undefined;
                              setInterestEnabled(interest?.enabled ?? false);
                              setInterestRate(
                                interest?.annualRateBasisPoints != null
                                  ? String(interest.annualRateBasisPoints / 100)
                                  : "",
                              );
                              setInterestFrequency(interest?.frequency ?? "monthly");
                              setInterestPayDay(interest?.payDay ?? 15);
                            }}
                            aria-label={`Edit ${account.name}`}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                        )}
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => {
                              removeAccountMutation.reset();
                              setRemovingAccount(account);
                            }}
                            aria-label={`Remove ${account.name}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="dashboard-account-default"
                          onClick={() => setDefaultSpendingAccountId(account.id)}
                          aria-pressed={isDefaultSpending}
                          aria-label={`Use ${account.name} as the default spending account`}
                          title={
                            isDefaultSpending
                              ? `${account.name} is the default spending account`
                              : `Use ${account.name} as the default spending account`
                          }
                        >
                          <Star
                            size={14}
                            aria-hidden="true"
                            fill={isDefaultSpending ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAdjustBalance(account)}
                          aria-label={`Adjust balance for ${account.name}`}
                          title={`Adjust balance for ${account.name}`}
                        >
                          <SlidersHorizontal size={14} aria-hidden="true" />
                        </button>
                      </span>
                      <AccountBalances account={account} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {accountBalances.items.some((account) => account.archived) && (
              <details className="dashboard-removed-accounts">
                <summary>
                  Removed accounts (
                  {accountBalances.items.filter((account) => account.archived).length})
                </summary>
                <p>Removed accounts stay read-only so historical transactions remain accurate.</p>
                <ul>
                  {accountBalances.items
                    .filter((account) => account.archived)
                    .map((account) => (
                      <li key={account.id}>
                        <span>{account.name}</span>
                        <AccountBalances account={account} />
                      </li>
                    ))}
                </ul>
              </details>
            )}
            <UpgradePrompt error={accountActionError} />
            {accountActionError && !isBillingEnforcementError(accountActionError) && (
              <p className="dashboard-account-error" role="alert">
                <strong>That account change did not go through.</strong>
                <span>{accountActionError.message}</span>
              </p>
            )}
          </section>
        </div>
      )}

      {editingAccount && (
        <AccountFormModal
          accounts={accounts}
          editingAccount={editingAccount}
          isPro={isPro}
          onAdjustBalance={onAdjustBalance}
        />
      )}
      {removingAccount && (
        <ConfirmDialog
          title={`Remove ${removingAccount.name}?`}
          consequence={
            <>
              Removing <strong>{removingAccount.name}</strong> takes it out of your account list, so
              it can no longer be chosen for new transactions. Its{" "}
              {formatMoney(removalBalanceMinor, removalCurrency)} balance and every transaction
              recorded against it stay in your history as read-only records, and because your
              overall balance is calculated from recorded transactions, the{" "}
              {formatMoney(overallBalanceMinor, baseCurrency)} total does not change. This cannot be
              undone.
              {linkedSubscriptionWarning ? <> {linkedSubscriptionWarning}</> : null}
            </>
          }
          confirmLabel="Remove account"
          busyLabel="Removing…"
          busy={removeAccountMutation.isPending}
          error={removeAccountMutation.error?.message}
          onConfirm={() => removeAccountMutation.mutate(removingAccount.id)}
          onClose={() => setRemovingAccount(undefined)}
        />
      )}
    </>
  );
}

/** An account's balance in its own currency, then any other currency it holds entries in. */
function AccountBalances({ account }: { account: AccountBalanceSummaryItem }) {
  return (
    <span className="dashboard-account-balances">
      <strong>
        {formatMoney(account.balancesByCurrency[account.currency] ?? 0, account.currency)}
      </strong>
      {otherCurrenciesWithAmounts(account.balancesByCurrency, account.currency).map((currency) => (
        <em key={currency}>
          {formatMoney(account.balancesByCurrency[currency] ?? 0, currency)} {currency}
        </em>
      ))}
    </span>
  );
}
