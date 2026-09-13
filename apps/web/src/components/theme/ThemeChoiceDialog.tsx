import { Check, Coffee, Moon, Sun, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useRootLock } from "../../hooks/useRootLock";
import { useTheme, type Theme } from "../../theme/ThemeProvider";
import "./ThemeChoiceDialog.css";

const THEME_OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "Bright, warm surfaces for daytime use.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Neutral, low-glare surfaces for lower light.",
    icon: Moon,
  },
  {
    value: "coffee",
    label: "Coffee",
    description: "Cream and coffee tones with Zoption green accents.",
    icon: Coffee,
  },
] satisfies Array<{
  value: Theme;
  label: string;
  description: string;
  icon: typeof Sun;
}>;

export function ThemeChoiceDialog() {
  const { theme, hasThemePreference, previewTheme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<Theme>(theme);
  const dialogRef = useRef<HTMLElement>(null);
  const optionRefs = useRef<Record<Theme, HTMLButtonElement | null>>({
    light: null,
    dark: null,
    coffee: null,
  });
  const initialOptionRef = useRef<HTMLButtonElement | null>(null);
  const initialThemeRef = useRef(theme);
  const isOpen = !hasThemePreference;

  useRootLock(isOpen);

  /**
   * Escape and the close control dismiss the dialog by keeping the default Light
   * theme, exactly as confirming Light would, so the first visit can never trap
   * someone who does not want to choose.
   */
  function dismissDialog() {
    setTheme("light");
  }

  const handleDialogKeyDown = useFocusTrap(dialogRef, {
    onEscape: dismissDialog,
    initialFocusRef: initialOptionRef,
  });

  if (!isOpen) return null;

  function selectTheme(nextTheme: Theme) {
    setSelectedTheme(nextTheme);
    previewTheme(nextTheme);
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % THEME_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = THEME_OPTIONS.length - 1;
    }

    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextOption = THEME_OPTIONS[nextIndex];
    if (!nextOption) return;

    selectTheme(nextOption.value);
    optionRefs.current[nextOption.value]?.focus();
  }

  const selectedOption = THEME_OPTIONS.find((option) => option.value === selectedTheme);

  return createPortal(
    <div className="theme-choice-layer">
      <div className="theme-choice-backdrop" aria-hidden="true" />
      <section
        ref={dialogRef}
        className="theme-choice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-choice-title"
        aria-describedby="theme-choice-description"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="theme-choice-header">
          <p className="eyebrow">Appearance</p>
          <h2 id="theme-choice-title">Choose how Zoption looks</h2>
          <p id="theme-choice-description">
            Select a theme to preview it, then confirm your choice. You can change it anytime.
            Closing keeps the default Light theme.
          </p>
          <button
            type="button"
            className="icon-button theme-choice-close"
            aria-label="Close and keep the default Light theme"
            onClick={dismissDialog}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="theme-choice-options" role="radiogroup" aria-label="Theme options">
          {THEME_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const selected = option.value === selectedTheme;

            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[option.value] = element;
                  if (option.value === initialThemeRef.current) initialOptionRef.current = element;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Preview ${option.label} theme`}
                tabIndex={selected ? 0 : -1}
                className={`theme-choice-option theme-choice-option-${option.value}`}
                data-selected={selected || undefined}
                onClick={() => selectTheme(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="theme-choice-option-heading">
                  <span className="theme-choice-option-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="theme-choice-option-copy">
                    <span className="theme-choice-option-title">
                      <strong>{option.label}</strong>
                      <span className="theme-choice-selected" aria-hidden="true">
                        <Check size={13} strokeWidth={2.5} />
                        Selected
                      </span>
                    </span>
                    <small>{option.description}</small>
                  </span>
                </span>
                <span className="theme-choice-preview" aria-hidden="true">
                  <span className="theme-choice-preview-bar" />
                  <span className="theme-choice-preview-layout">
                    <span className="theme-choice-preview-nav" />
                    <span className="theme-choice-preview-content">
                      <span />
                      <span />
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <footer className="theme-choice-footer">
          <p className="theme-choice-note">Saved on this device. Closing keeps Light.</p>
          <button
            type="button"
            className="button primary theme-choice-confirm"
            onClick={() => setTheme(selectedTheme)}
          >
            Confirm {selectedOption?.label ?? "theme"} theme
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
