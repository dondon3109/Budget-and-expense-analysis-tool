import {
  interestFrequencies,
  type AccountBalanceSummaryItem,
  type AccountInput,
  type InterestFrequency,
} from "@zoption/shared";
import { SlidersHorizontal, X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import type { AccountMutations } from "./useAccountMutations";
import { isBillingEnforcementError } from "../../lib/api";
import { UpgradePrompt } from "../billing/UpgradePrompt";
import { accountTypeOptionLabel, accountTypes } from "./accountTypes";

interface DashboardFormModalProps {
  labelledBy: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape: () => void;
  children: ReactNode;
}

/**
 * Chrome shared by the dashboard's inline form dialogs. It renders through a portal so the
 * inert application root from useRootLock does not also disable the dialog, and it owns the
 * Tab trap, Escape handling, and focus restore that these dialogs used to lack.
 */
function DashboardFormModal({
  labelledBy,
  initialFocusRef,
  onEscape,
  children,
}: DashboardFormModalProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useRootLock(true);
  const handleKeyDown = useFocusTrap(dialogRef, { initialFocusRef, onEscape });

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

interface AccountFormModalProps {
  accounts: AccountMutations;
  editingAccount: AccountBalanceSummaryItem;
  isPro: boolean;
  onAdjustBalance: (account: AccountBalanceSummaryItem) => void;
}

/** Edits an account's name, type, and savings interest; the draft lives in useAccountMutations. */
export function AccountFormModal({
  accounts,
  editingAccount,
  isPro,
  onAdjustBalance,
}: AccountFormModalProps) {
  const {
    editName,
    setEditName,
    editType,
    setEditType,
    interestEnabled,
    setInterestEnabled,
    interestRate,
    setInterestRate,
    interestFrequency,
    setInterestFrequency,
    interestPayDay,
    setInterestPayDay,
    setEditingAccount,
    updateAccountMutation,
  } = accounts;
  const editAccountNameRef = useRef<HTMLInputElement>(null);

  return (
    <DashboardFormModal
      labelledBy="edit-account-title"
      initialFocusRef={editAccountNameRef}
      onEscape={() => {
        if (!updateAccountMutation.isPending) setEditingAccount(undefined);
      }}
    >
      <header className="modal-header">
        <div>
          <p className="eyebrow">Custom account</p>
          <h2 id="edit-account-title">Edit account</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => setEditingAccount(undefined)}
          disabled={updateAccountMutation.isPending}
          aria-label="Close edit account"
        >
          <X size={19} />
        </button>
      </header>
      <form
        className="transaction-form"
        onSubmit={(event) => {
          event.preventDefault();
          updateAccountMutation.mutate({
            id: editingAccount.id,
            name: editName,
            type: editType,
            ...(editType === "savings" && isPro
              ? {
                  interest: {
                    enabled: interestEnabled,
                    annualRateBasisPoints:
                      interestEnabled && Number(interestRate) > 0
                        ? Math.round(Number(interestRate) * 100)
                        : 0,
                    frequency: interestEnabled ? interestFrequency : "monthly",
                    payDay:
                      interestEnabled && interestFrequency !== "daily" ? interestPayDay : null,
                  },
                }
              : {}),
          });
        }}
      >
        <fieldset>
          <legend>Details</legend>
          <label>
            <span>Account name</span>
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              maxLength={80}
              required
              ref={editAccountNameRef}
            />
          </label>
          <label>
            <span>Account type</span>
            <select
              value={editType}
              onChange={(event) => setEditType(event.target.value as AccountInput["type"])}
            >
              {accountTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {accountTypeOptionLabel(type.value)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {editType === "savings" && (
          <fieldset className="account-interest-fieldset">
            <legend>Interest</legend>
            {isPro ? (
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={interestEnabled}
                  onChange={(event) => setInterestEnabled(event.target.checked)}
                />
                <span>Earn automatic interest</span>
              </label>
            ) : (
              <p className="account-interest-free-option">
                Earn automatic interest on this account
              </p>
            )}
            {isPro ? (
              interestEnabled && (
                <div className="account-interest-settings">
                  <label>
                    <span>Annual interest rate (%)</span>
                    <input
                      value={interestRate}
                      onChange={(event) => setInterestRate(event.target.value)}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      inputMode="decimal"
                      placeholder="e.g. 5.00"
                      required
                    />
                  </label>
                  <label>
                    <span>Interest received</span>
                    <select
                      value={interestFrequency}
                      onChange={(event) =>
                        setInterestFrequency(event.target.value as InterestFrequency)
                      }
                    >
                      {interestFrequencies.map((frequency) => (
                        <option key={frequency} value={frequency}>
                          {frequency === "daily"
                            ? "Daily"
                            : frequency === "monthly"
                              ? "Monthly"
                              : "Yearly"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {interestFrequency !== "daily" && (
                    <label>
                      <span>Pay day</span>
                      <select
                        value={interestPayDay}
                        onChange={(event) => setInterestPayDay(Number(event.target.value))}
                      >
                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="form-hint">
                    Interest is computed from the account's balance and credited automatically{" "}
                    {interestFrequency === "daily"
                      ? "each day"
                      : `on the ${interestPayDay}${interestPayDay === 1 ? "st" : interestPayDay === 2 ? "nd" : interestPayDay === 3 ? "rd" : "th"}`}
                    .
                  </p>
                </div>
              )
            ) : (
              <p className="form-hint account-interest-pro-callout">
                Automatic interest is a Pro feature.{" "}
                <Link to="/app/settings#plan-and-billing">Upgrade to Zoption Pro</Link> to earn
                interest on this savings account.
              </p>
            )}
          </fieldset>
        )}
        <UpgradePrompt error={updateAccountMutation.error} />
        {updateAccountMutation.error && !isBillingEnforcementError(updateAccountMutation.error) && (
          <p className="form-error" role="alert">
            {updateAccountMutation.error.message}
          </p>
        )}
        <div className="edit-account-adjust-prompt">
          <span>Looking to adjust the current balance?</span>
          <button
            type="button"
            className="button secondary compact-action"
            onClick={() => {
              const target = editingAccount;
              setEditingAccount(undefined);
              onAdjustBalance(target);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" /> Adjust balance
          </button>
        </div>
        <div className="modal-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => setEditingAccount(undefined)}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={updateAccountMutation.isPending}
          >
            {updateAccountMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </DashboardFormModal>
  );
}
