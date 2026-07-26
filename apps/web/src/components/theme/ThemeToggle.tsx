import { Check, Coffee, Moon, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useTheme, type Theme } from "../../theme/ThemeProvider";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "coffee", label: "Coffee", icon: Coffee },
] satisfies Array<{ value: Theme; label: string; icon: typeof Sun }>;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Record<Theme, HTMLButtonElement | null>>({
    light: null,
    dark: null,
    coffee: null,
  });
  const currentOption =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0]!;
  const CurrentIcon = currentOption.icon;

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  function openMenu() {
    setOpen(true);
    window.requestAnimationFrame(() => optionRefs.current[theme]?.focus());
  }

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    openMenu();
    const target = event.key === "ArrowUp" ? THEME_OPTIONS.at(-1)?.value : theme;
    if (target) window.requestAnimationFrame(() => optionRefs.current[target]?.focus());
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const currentIndex = THEME_OPTIONS.findIndex(
      (option) => optionRefs.current[option.value] === document.activeElement,
    );
    let nextIndex: number | undefined;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (Math.max(currentIndex, 0) + 1) % THEME_OPTIONS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex <= 0 ? THEME_OPTIONS.length : currentIndex) - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = THEME_OPTIONS.length - 1;
    }

    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextOption = THEME_OPTIONS[nextIndex];
    if (!nextOption) return;
    optionRefs.current[nextOption.value]?.focus();
  }

  return (
    <div ref={wrapperRef} className="theme-menu">
      <button
        ref={triggerRef}
        className="theme-toggle"
        type="button"
        aria-label={`Choose theme. Current theme: ${currentOption.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Choose theme"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <CurrentIcon size={17} aria-hidden="true" />
        <span>{currentOption.label}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="theme-menu-popover"
          role="menu"
          aria-label="Choose theme"
          onKeyDown={handleMenuKeyDown}
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = option.value === theme;

            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[option.value] = element;
                }}
                type="button"
                className="theme-menu-option"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => chooseTheme(option.value)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{option.label}</span>
                <Check className="theme-menu-check" size={15} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
