import {
  GOAL_OTHER_TEXT_MAX_LENGTH,
  primaryGoalLabels,
  primaryGoals,
  type PrimaryGoal,
} from "@zoption/shared";
import { useId, useState } from "react";

import "./GoalPicker.css";

export type GoalChoice = { goals: PrimaryGoal[]; otherText?: string };

type GoalPickerProps = {
  legend: string;
  /** The saved goals, lead goal first. */
  goals: PrimaryGoal[];
  otherText: string | null;
  disabled: boolean;
  /** Label of the button that saves the picks. */
  confirmLabel: string;
  onChoose: (choice: GoalChoice) => void;
};

/**
 * Pick any number of goals. The order they are picked in is kept: the first is the lead goal. Nothing
 * is saved until the confirm button, so keyboard users can move through the boxes freely.
 */
export function GoalPicker({
  legend,
  goals,
  otherText,
  disabled,
  confirmLabel,
  onChoose,
}: GoalPickerProps) {
  const noteId = useId();
  // Local only: the picks and note the user has not confirmed yet.
  const [picked, setPicked] = useState<PrimaryGoal[]>();
  const [note, setNote] = useState<string>();
  const selected = picked ?? goals;
  const noteValue = note ?? otherText ?? "";

  function toggle(goal: PrimaryGoal) {
    setPicked(selected.includes(goal) ? selected.filter((g) => g !== goal) : [...selected, goal]);
  }

  return (
    <fieldset className="goal-picker" disabled={disabled}>
      <legend>{legend}</legend>
      <p className="goal-picker-hint">
        Pick all that apply. The first one you pick is your main focus.
      </p>
      <div className="goal-picker-options">
        {primaryGoals.map((option) => (
          <label key={option} className="goal-picker-option">
            <input
              type="checkbox"
              name="goals"
              value={option}
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
            />
            <span>{primaryGoalLabels[option]}</span>
            {selected.length > 1 && selected[0] === option && (
              <span className="goal-picker-badge">Main focus</span>
            )}
          </label>
        ))}
      </div>
      {selected.includes("other") && (
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
      <button
        className="button primary"
        type="button"
        disabled={selected.length === 0}
        onClick={() => onChoose({ goals: selected, otherText: noteValue })}
      >
        {confirmLabel}
      </button>
    </fieldset>
  );
}
