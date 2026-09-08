import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  formatAdjustmentPreview,
  parseAmountToMinor,
  resolveAdjustmentCategoryId,
  type AccountBalanceSummaryItem,
  type AccountRecord,
} from "@zoption/shared";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { createTransaction, deleteTransaction, getCategories } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { queryKeys } from "../../lib/queryKeys";
import { userWorkspace } from "../../lib/workspace";
import "./AdjustBalanceModal.css";

export interface AdjustBalanceModalProps {
  account: AccountRecord | AccountBalanceSummaryItem;
  accounts?: (AccountRecord | AccountBalanceSummaryItem)[];
  onSelectAccount?: (account: AccountRecord | AccountBalanceSummaryItem) => void;
  onClose: () => void;
}

export function AdjustBalanceModal({
  account,
  accounts,
  onSelectAccount,
  onClose,
}: AdjustBalanceModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspace = user ? userWorkspace(user) : undefined;

  const [newBalance, setNewBalance] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adjustmentId, setAdjustmentId] = useState<string | null>(null);

  const currency = account.currency ?? "PHP";
  const currentBalanceMinor =
    account.balancesByCurrency?.[currency] ??
    (account.balanceMinor != null ? account.balanceMinor : 0);

  const categoriesQuery = useQuery({
    queryKey: workspace ? queryKeys.categories(workspace, true) : ["categories"],
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

  const hasChanges = preview !== null && preview.kind !== null;

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace not available.");
      if (parsedNewBalance == null) throw new Error("Please enter a valid amount.");

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
      if (workspace) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) });
      }
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
      if (workspace) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.accounts(workspace) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions(workspace) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspace) });
      }
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to undo adjustment.");
    },
  });

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="form-modal adjust-balance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-balance-title"
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Account balance</p>
            <h2 id="adjust-balance-title">Adjust current balance</h2>
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
                    setNewBalance("");
                    setErrorMessage(null);
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

          <div className="adjust-balance-current-card">
            <div>
              <span className="adjust-balance-label">Account</span>
              <strong className="adjust-balance-account-name">{account.name}</strong>
            </div>
            <div className="adjust-balance-current-value">
              <span className="adjust-balance-label">Current Ledger Balance</span>
              <strong>{formatMoney(currentBalanceMinor, currency)}</strong>
            </div>
          </div>

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
                <span>New actual balance</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newBalance}
                  onChange={(e) => {
                    setNewBalance(e.target.value);
                    setErrorMessage(null);
                  }}
                  autoFocus
                  disabled={adjustMutation.isPending}
                  required
                />
              </label>

              {preview && preview.kind ? (
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
                  onClick={onClose}
                  disabled={adjustMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!hasChanges || adjustMutation.isPending}
                >
                  {adjustMutation.isPending ? "Saving…" : "Save adjustment"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
