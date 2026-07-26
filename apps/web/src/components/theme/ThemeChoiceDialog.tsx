import { Check, Coffee, Moon, Sun } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { useTheme, type Theme } from "../../theme/ThemeProvider";

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
  const initialThemeRef = useRef(theme);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = !hasThemePreference;

  useLayoutEffect(() => {
    if (!isOpen) return;

    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;
    const activeElement = document.activeElement;

    if (
      !previousFocusRef.current &&
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !dialogRef.current?.contains(activeElement)
    ) {
      previousFocusRef.current = activeElement;
    }

    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    optionRefs.current[initialThemeRef.current]?.focus();

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;

      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

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

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.tabIndex >= 0);
    const firstControl = focusable[0];
    const lastControl = focusable.at(-1);
    if (!firstControl || !lastControl) return;

    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      lastControl.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? lastControl : firstControl).focus();
    }
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
          <h1 id="theme-choice-title">Choose how Zoption looks</h1>
          <p id="theme-choice-description">
            Select a theme to preview it, then confirm your choice. You can change it anytime.
          </p>
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
          <p className="theme-choice-note">Saved on this device after you confirm.</p>
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
