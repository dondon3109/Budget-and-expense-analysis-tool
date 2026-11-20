import {
  budgetingStyleLabels,
  budgetingStyles,
  incomeCadenceLabels,
  incomeCadences,
  SPENDING_FOCUS_MAX,
  spendingFocusLabels,
  spendingFocuses,
  type MoneyPreferences,
  type SpendingFocus,
} from "@zoption/shared";
import { useId, useState } from "react";

import "./GoalPicker.css";

type PreferencesPickerProps = {
  /** The saved answers. */
  preferences: MoneyPreferences;
  disabled: boolean;
  confirmLabel: string;
  onSave: (preferences: MoneyPreferences) => void;
};

/**
 * How the user is paid, how they like to budget, and up to three spending areas to watch. Every
 * question is optional; nothing is saved until the confirm button.
 */
export function PreferencesPicker({
  preferences,
  disabled,
  confirmLabel,
  onSave,
}: PreferencesPickerProps) {
  const name = useId();
  // Local only: answers the user has not confirmed yet.
  const [draft, setDraft] = useState<MoneyPreferences>();
  const current = draft ?? preferences;
  const focusFull = current.spendingFocus.length >= SPENDING_FOCUS_MAX;

  function toggleFocus(focus: SpendingFocus) {
    const picked = current.spendingFocus.includes(focus)
      ? current.spendingFocus.filter((key) => key !== focus)
      : [...current.spendingFocus, focus];
    setDraft({ ...current, spendingFocus: picked });
  }

  return (
    <div className="preferences-picker">
      <fieldset className="goal-picker" disabled={disabled}>
        <legend>How often do you get paid?</legend>
        <div className="goal-picker-options">
          {incomeCadences.map((option) => (
            <label key={option} className="goal-picker-option">
              <input
                type="radio"
                name={`${name}-cadence`}
                value={option}
                checked={current.incomeCadence === option}
                onChange={() => setDraft({ ...current, incomeCadence: option })}
              />
              <span>{incomeCadenceLabels[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="goal-picker" disabled={disabled}>
        <legend>How do you like to budget?</legend>
        <div className="goal-picker-options">
          {budgetingStyles.map((option) => (
            <label key={option} className="goal-picker-option">
              <input
                type="radio"
                name={`${name}-style`}
                value={option}
                checked={current.budgetingStyle === option}
                onChange={() => setDraft({ ...current, budgetingStyle: option })}
              />
              <span>{budgetingStyleLabels[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="goal-picker" disabled={disabled}>
        <legend>What spending do you want to watch?</legend>
        <p className="goal-picker-hint">Pick up to {SPENDING_FOCUS_MAX}.</p>
        <div className="goal-picker-options">
          {spendingFocuses.map((option) => {
            const checked = current.spendingFocus.includes(option);
            return (
              <label key={option} className="goal-picker-option">
                <input
                  type="checkbox"
                  name={`${name}-focus`}
                  value={option}
                  checked={checked}
                  disabled={!checked && focusFull}
                  onChange={() => toggleFocus(option)}
                />
                <span>{spendingFocusLabels[option]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        className="button primary"
        type="button"
        disabled={disabled}
        onClick={() => onSave(current)}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
