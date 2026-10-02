import {
  GOAL_OTHER_TEXT_MAX_LENGTH,
  primaryGoalLabels,
  primaryGoals,
  type PrimaryGoal,
} from "@zoption/shared";
import { useId, useState, type FormEvent, type MouseEvent } from "react";

import "./GoalPicker.css";

export type GoalChoice = { goal: PrimaryGoal; otherText?: string };

type GoalPickerProps = {
  legend: string;
  /** The saved goal, if any. */
  goal: PrimaryGoal | null;
  otherText: string | null;
  disabled: boolean;
  /** Label of the button that confirms a keyboard pick or an "Other" answer. */
  confirmLabel: string;
  onChoose: (choice: GoalChoice) => void;
};

/**
 * Single-select goal cards. Clicking a preset goal chooses it at once. Arrow keys move the
 * selection without choosing, so a keyboard user can pass over cards without leaving the step;
 * they confirm with the button. "Other" also reveals an optional note and is confirmed the same way.
 */
export function GoalPicker({
  legend,
  goal,
  otherText,
  disabled,
  confirmLabel,
  onChoose,
}: GoalPickerProps) {
  const noteId = useId();
  // Local only: a pick or note the user has not confirmed yet.
  const [picked, setPicked] = useState<PrimaryGoal>();
  const [note, setNote] = useState<string>();
  const selected = picked ?? goal;
  const noteValue = note ?? otherText ?? "";

  // A pointer click has detail >= 1; the click a browser fires for an arrow key or Space has 0.
  function chooseOnClick(event: MouseEvent<HTMLInputElement>, next: PrimaryGoal) {
    if (event.detail > 0 && next !== "other") onChoose({ goal: next });
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    onChoose(selected === "other" ? { goal: "other", otherText: noteValue } : { goal: selected });
  }

  const unconfirmed = selected !== null && selected !== goal;

  return (
    <fieldset className="goal-picker" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="goal-picker-options">
        {primaryGoals.map((option) => (
          <label key={option} className="goal-picker-option">
            <input
              type="radio"
              name="primary-goal"
              value={option}
              checked={selected === option}
              onChange={() => setPicked(option)}
              onClick={(event) => chooseOnClick(event, option)}
            />
            <span>{primaryGoalLabels[option]}</span>
          </label>
        ))}
      </div>
      {selected === "other" && (
        <div className="goal-picker-other">
          <label htmlFor={noteId}>
            <span>Tell us more (optional)</span>
          </label>
          <input
            id={noteId}
            type="text"
            autoComplete="off"
            maxLength={GOAL_OTHER_TEXT_MAX_LENGTH}
            value={noteValue}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      )}
      {(unconfirmed || selected === "other") && (
        <button className="button primary" type="button" onClick={confirm}>
          {confirmLabel}
        </button>
      )}
    </fieldset>
  );
}
