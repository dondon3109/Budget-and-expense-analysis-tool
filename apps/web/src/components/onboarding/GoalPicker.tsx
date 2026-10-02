import {
  GOAL_OTHER_TEXT_MAX_LENGTH,
  primaryGoalLabels,
  primaryGoals,
  type PrimaryGoal,
} from "@zoption/shared";
import { useId, useState, type FormEvent } from "react";

import "./GoalPicker.css";

export type GoalChoice = { goal: PrimaryGoal; otherText?: string };

type GoalPickerProps = {
  legend: string;
  /** The saved goal, if any. */
  goal: PrimaryGoal | null;
  otherText: string | null;
  disabled: boolean;
  /** Label of the button that confirms an "Other" answer. */
  confirmLabel: string;
  onChoose: (choice: GoalChoice) => void;
};

/**
 * Single-select goal cards. A preset goal is chosen the moment it is picked; "Other" first reveals
 * an optional note and is chosen with the confirm button.
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

  function choose(next: PrimaryGoal) {
    setPicked(next);
    if (next !== "other") onChoose({ goal: next });
  }

  function confirmOther(event: FormEvent) {
    event.preventDefault();
    onChoose({ goal: "other", otherText: noteValue });
  }

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
              onChange={() => choose(option)}
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
          <button className="button primary" type="button" onClick={confirmOther}>
            {confirmLabel}
          </button>
        </div>
      )}
    </fieldset>
  );
}
