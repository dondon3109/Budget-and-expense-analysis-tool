import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  currencies,
  currencyMetadata,
  formatAdjustmentPreview,
  heldCurrencies,
  holdsMultipleCurrencies,
  isCurrency,
  parseAmountToMinor,
  resolveAdjustmentCategoryId,
  type AccountBalanceSummaryItem,
  type AccountRecord,
  type Currency,
} from "@zoption/shared";
import { Check, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { createTransaction, deleteTransaction, getCategories } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import { invalidateAfterAccountWrite } from "../../queries/accounts";
import { useActiveWorkspace } from "../layout/ActiveWorkspaceProvider";
import "./AdjustBalanceModal.css";

export interface AdjustBalanceModalProps {
  account: AccountRecord | AccountBalanceSummaryItem;
  accounts?: (AccountRecord | AccountBalanceSummaryItem)[];
  onSelectAccount?: (account: AccountRecord | AccountBalanceSummaryItem) => void;
  onClose: () => void;
}

/**
 * Books the difference to an account's current balance as an Uncategorized adjustment, with
 * Undo. A bank account picks which held currency to adjust, and "Add currency" opens a
 * balance in one it does not hold yet by booking its opening balance.
 */
export function AdjustBalanceModal({
  account,
  accounts,
  onSelectAccount,
  onClose,
}: AdjustBalanceModalProps) {
  const queryClient = useQueryClient();
  const { workspace } = useActiveWorkspace();

  const [newBalance, setNewBalance] = useState("");
  // Null follows the account's own currency; only a bank account offers another one.
  const [chosenCurrency, setChosenCurrency] = useState<Currency | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCurrency, setNewCurrency] = useState<Currency | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adjustmentId, setAdjustmentId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const newBalanceRef = useRef<HTMLInputElement>(null);
  const undoAdjustmentRef = useRef<HTMLButtonElement>(null);

  const multiCurrency = holdsMultipleCurrencies(account.type);
  const held = heldCurrencies({
    currency: account.currency ?? "PHP",
    balancesByCurrency: account.balancesByCurrency,
  });
  const addable = currencies.filter((code) => !held.includes(code));
  const currency: Currency | null = adding
    ? newCurrency
    : ((multiCurrency ? chosenCurrency : null) ?? account.currency ?? "PHP");
  const currentBalanceMinor = !currency
    ? 0
    : (account.balancesByCurrency?.[currency] ??
      (currency === account.currency && account.balanceMinor != null ? account.balanceMinor : 0));

  const startAdding = (value: boolean): void => {
    setAdding(value);
    setNewCurrency(null);
    setNewBalance("");
    setErrorMessage(null);
  };

  const categoriesQuery = useQuery({
    queryKey: workspace
      ? queryKeys.categories(workspace, true)
      : queryKeys.withoutWorkspace("categories"),
    queryFn: () => (workspace ? getCategories(workspace, true) : Promise.resolve([])),
    enabled: Boolean(workspace),
  });

  const parsedNewBalance = (() => {
    if (!newBalance.trim()) return null;
    try {
      return parseAmountToMinor(newBalance);
    } catch {
      return null;
    }
  })();

  const preview =
    parsedNewBalance == null
      ? null
      : computeBalanceAdjustment(currentBalanceMinor, parsedNewBalance);

  const hasChanges = currency !== null && preview !== null && preview.kind !== null;

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace not available.");
      if (parsedNewBalance == null) throw new Error("Please enter a valid amount.");
      if (!currency) throw new Error("Choose a currency to add.");

      const categories =
        categoriesQuery.data && categoriesQuery.data.length > 0
          ? categoriesQuery.data
          : await getCategories(workspace, true).catch(() => []);
      const kind = computeBalanceAdjustment(currentBalanceMinor, parsedNewBalance).kind;
      if (kind === null) {
        throw new Error("The balance already matches this amount.");
      }

      const categoryId =
        resolveAdjustmentCategoryId(categories, kind) ??
        categories.find((c) => c.kind === kind)?.id ??
        categories[0]?.id;
      if (!categoryId) {
        throw new Error("No category is available to book this adjustment.");
      }

      const input = buildBalanceAdjustmentInput({
        accountId: account.id,
        accountName: account.name,
        categoryId,
        currency,
        currentBalanceMinor,
        newBalanceMinor: parsedNewBalance,
      });

      if (!input) {
        throw new Error("The balance already matches this amount.");
      }

      const created = await createTransaction(workspace, input);
      return created.id;
    },
    onSuccess: (id) => {
      setAdjustmentId(id);
      setErrorMessage(null);
      if (workspace) void invalidateAfterAccountWrite(queryClient, workspace);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save adjustment.");
    },
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!workspace || !adjustmentId) return;
      await deleteTransaction(workspace, adjustmentId);
    },
    onSuccess: () => {
      setAdjustmentId(null);
      setNewBalance("");
      setErrorMessage(null);
      if (workspace) void invalidateAfterAccountWrite(queryClient, workspace);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to undo adjustment.");
    },
  });

  useRootLock(true);

  const handleKeyDown = useFocusTrap(dialogRef, {
    initialFocusRef: newBalanceRef,
    onEscape: () => {
      if (!adjustMutation.isPending && !undoMutation.isPending) onClose();
    },
  });

  // The balance field disappears once the adjustment is booked, so move focus to the
  // result actions instead of letting it fall back to the document body.
  useEffect(() => {
    if (adjustmentId) undoAdjustmentRef.current?.focus();
  }, [adjustmentId]);

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal adjust-balance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-balance-title"
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Account balance</p>
            <h2 id="adjust-balance-title">
              {adding ? "Add a currency balance" : "Adjust current balance"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={adjustMutation.isPending || undoMutation.isPending}
            aria-label="Close adjust balance modal"
          >
            <X size={19} />
          </button>
        </header>

        <div className="adjust-balance-body">
          {accounts && accounts.length > 1 && onSelectAccount && !adjustmentId && (
            <label className="adjust-balance-field">
              <span>Select account</span>
              <select
                value={account.id}
                onChange={(e) => {
                  const selected = accounts.find((a) => a.id === e.target.value);
                  if (selected) {
                    onSelectAccount(selected);
                    setChosenCurrency(null);
                    startAdding(false);
                  }
                }}
                disabled={adjustMutation.isPending}
              >
                {accounts.map((a) => {
                  const acctCurrency = a.currency ?? "PHP";
                  const acctBalance = a.balancesByCurrency?.[acctCurrency] ?? a.balanceMinor ?? 0;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(acctBalance, acctCurrency)})
                    </option>
                  );
                })}
              </select>
            </label>
          )}

          {multiCurrency && !adding && !adjustmentId && held.length > 1 && (
            <label className="adjust-balance-field">
              <span>Currency</span>
              <select
                value={currency ?? ""}
                onChange={(e) => {
                  if (!isCurrency(e.target.value)) return;
                  setChosenCurrency(e.target.value);
                  setNewBalance("");
                  setErrorMessage(null);
                }}
                disabled={adjustMutation.isPending}
              >
                {held.map((code) => (
                  <option key={code} value={code}>
                    {`${currencyMetadata[code].label} · ${formatMoney(account.balancesByCurrency?.[code] ?? 0, code)}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {adding && !adjustmentId && (
            <label className="adjust-balance-field">
              <span>New currency</span>
              <select
                autoFocus
                value={newCurrency ?? ""}
                onChange={(e) => {
                  if (!isCurrency(e.target.value)) return;
                  setNewCurrency(e.target.value);
                  setErrorMessage(null);
                }}
                disabled={adjustMutation.isPending}
              >
                <option value="" disabled>
                  Choose a currency
                </option>
                {addable.map((code) => (
                  <option key={code} value={code}>
                    {currencyMetadata[code].label}
                  </option>
                ))}
              </select>
              <small className="adjust-balance-hint">
                The account keeps a separate balance for each currency.
              </small>
            </label>
          )}

          <div className="adjust-balance-current-card">
            <div>
              <span className="adjust-balance-label">Account</span>
              <strong className="adjust-balance-account-name">{account.name}</strong>
            </div>
            {currency && !adding ? (
              <div className="adjust-balance-current-value">
                <span className="adjust-balance-label">
                  {multiCurrency ? `Current ${currency} balance` : "Current Ledger Balance"}
                </span>
                <strong>{formatMoney(currentBalanceMinor, currency)}</strong>
              </div>
            ) : null}
          </div>

          {multiCurrency && !adding && !adjustmentId && addable.length > 0 && (
            <button
              type="button"
              className="button secondary compact adjust-balance-add-currency"
              onClick={() => startAdding(true)}
              disabled={adjustMutation.isPending}
            >
              <Plus size={15} aria-hidden="true" />
              Add currency
            </button>
          )}

          {adjustmentId ? (
            <div className="adjust-balance-success-state" role="status">
              <div className="adjust-balance-success-badge">
                <Check size={18} aria-hidden="true" />
                <span>Adjustment booked successfully!</span>
              </div>
              <p className="adjust-balance-note">
                A transaction was recorded under Uncategorized to update your balance. You can undo
                this adjustment now or close this dialog.
              </p>
              <div className="adjust-balance-actions">
                <button
                  ref={undoAdjustmentRef}
                  type="button"
                  className="button secondary"
                  onClick={() => void undoMutation.mutate()}
                  disabled={undoMutation.isPending}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  {undoMutation.isPending ? "Undoing…" : "Undo adjustment"}
                </button>
                <button type="button" className="button primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                adjustMutation.mutate();
              }}
              className="adjust-balance-form"
            >
              <label className="adjust-balance-field">
                <span>{adding ? "Opening balance" : "New actual balance"}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newBalance}
                  onChange={(e) => {
                    setNewBalance(e.target.value);
                    setErrorMessage(null);
                  }}
                  ref={newBalanceRef}
                  disabled={adjustMutation.isPending}
                  required
                />
              </label>

              {currency && preview && preview.kind ? (
                <div className="adjust-balance-preview">
                  <div className="adjust-balance-preview-row">
                    <span>Preview</span>
                    <code>
                      {formatAdjustmentPreview(
                        currentBalanceMinor,
                        parsedNewBalance ?? currentBalanceMinor,
                      )}
                    </code>
                  </div>
                  <div className="adjust-balance-preview-delta" data-tone={preview.kind}>
                    <strong>
                      {preview.kind === "income" ? "+" : "-"}
                      {formatMoney(preview.magnitudeMinor, currency)}
                    </strong>
                    <span>
                      {preview.kind === "income"
                        ? "booked as income adjustment"
                        : "booked as expense adjustment"}
                    </span>
                  </div>
                </div>
              ) : null}

              {newBalance.trim() && parsedNewBalance == null && (
                <p className="form-error" role="alert">
                  Enter a valid amount with no more than two decimal places.
                </p>
              )}

              {errorMessage && (
                <p className="form-error" role="alert">
                  {errorMessage}
                </p>
              )}

              <p className="adjust-balance-help">
                <SlidersHorizontal size={14} aria-hidden="true" />
                <span>
                  Adjusting balance creates an adjustment transaction for the difference. Your
                  historical records and reports remain intact.
                </span>
              </p>

              <div className="adjust-balance-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    if (!adding) return onClose();
                    startAdding(false);
                    newBalanceRef.current?.focus();
                  }}
                  disabled={adjustMutation.isPending}
                >
                  {adding ? "Back" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!hasChanges || adjustMutation.isPending}
                >
                  {adjustMutation.isPending
                    ? "Saving…"
                    : adding
                      ? `Add ${currency ?? "currency"} balance`
                      : "Save adjustment"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
