import { Egg, Moon } from "lucide-react";
import { useState } from "react";

import type { AuthenticatedWorkspace } from "../../lib/workspace";
import { usePet, useSetPetEnabled } from "../../queries/pet";
import { useTheme } from "../../theme/ThemeProvider";
import { THEME_OPTIONS } from "../../theme/themeOptions";
import "./PersonalizeStep.css";

const PET_CHOICES = [
  {
    value: true,
    title: "Yes, give me a pet",
    detail: "Hatch an egg with a 7-day streak, then keep it happy by logging money.",
    icon: Egg,
  },
  {
    value: false,
    title: "No pet for now",
    detail: "You can turn it on later from the pet page.",
    icon: Moon,
  },
] as const;

/**
 * The last first-run step: pick a theme (saved on this device as soon as it is clicked) and say
 * whether to raise a streak pet. The pet answer reaches the Worker only when it differs from the
 * current setting, so a yes costs no request and goes straight to the egg picker.
 */
export function PersonalizeStep({
  workspace,
  onDone,
}: {
  workspace: AuthenticatedWorkspace;
  onDone: (wantsPet: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const pet = usePet(workspace);
  const setEnabled = useSetPetEnabled(workspace);
  const [wantsPet, setWantsPet] = useState(true);
  const petEnabled = pet.data?.enabled ?? true;

  function finish() {
    if (wantsPet === petEnabled) {
      onDone(wantsPet);
      return;
    }
    setEnabled.mutate(wantsPet, { onSuccess: () => onDone(wantsPet) });
  }

  return (
    <div className="auth-form personalize-step">
      <fieldset className="personalize-group">
        <legend>Theme</legend>
        <div className="personalize-themes">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className={`personalize-theme personalize-theme-${option.value}`}
              >
                <input
                  type="radio"
                  name="personalize-theme"
                  checked={theme === option.value}
                  onChange={() => setTheme(option.value)}
                />
                <span className="personalize-swatch" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="personalize-group">
        <legend>Streak pet</legend>
        {PET_CHOICES.map((choice) => {
          const Icon = choice.icon;
          return (
            <label key={choice.title} className="personalize-pet">
              <input
                type="radio"
                name="personalize-pet"
                checked={wantsPet === choice.value}
                disabled={setEnabled.isPending}
                onChange={() => setWantsPet(choice.value)}
              />
              <Icon size={22} aria-hidden="true" />
              <span>
                <strong>{choice.title}</strong>
                <small>{choice.detail}</small>
              </span>
            </label>
          );
        })}
      </fieldset>

      {setEnabled.isError && (
        <p className="form-error" role="alert">
          Your pet choice could not be saved. Try again.
        </p>
      )}
      <button
        className="button primary"
        type="button"
        disabled={setEnabled.isPending}
        onClick={finish}
      >
        {setEnabled.isPending ? "Saving…" : wantsPet ? "Pick my egg" : "Go to dashboard"}
      </button>
    </div>
  );
}
