import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { isMonth, shiftMonth } from "../../lib/calendar";
import { formatFullMonth } from "../../lib/formatters";
import "./MonthSelector.css";

interface MonthSelectorProps {
  value: string;
  onChange: (month: string) => void;
  label: string;
  min?: string;
  max?: string;
  className?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthForYear(year: number, index: number): string {
  return `${year}-${String(index + 1).padStart(2, "0")}`;
}

function isWithinBounds(month: string, min?: string, max?: string): boolean {
  return (!min || month >= min) && (!max || month <= max);
}

function firstAvailableMonth(year: number, min?: string, max?: string): string | undefined {
  return Array.from({ length: 12 }, (_, index) => monthForYear(year, index)).find((month) =>
    isWithinBounds(month, min, max),
  );
}

function lastAvailableMonth(year: number, min?: string, max?: string): string | undefined {
  return Array.from({ length: 12 }, (_, index) => monthForYear(year, 11 - index)).find((month) =>
    isWithinBounds(month, min, max),
  );
}

export function MonthSelector({
  value,
  onChange,
  label,
  min,
  max,
  className,
}: MonthSelectorProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(() => Number(value.slice(0, 4)));
  const popoverId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const monthRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const validMin = isMonth(min ?? null) ? min : undefined;
  const validMax = isMonth(max ?? null) ? max : undefined;
  const canShowPreviousYear = !validMin || displayYear > Number(validMin.slice(0, 4));
  const canShowNextYear = !validMax || displayYear < Number(validMax.slice(0, 4));

  useEffect(() => {
    if (!open) return;

    setDisplayYear(Number(value.slice(0, 4)));
    window.requestAnimationFrame(() => monthRefs.current[value]?.focus());

    function closeOnOutsidePress(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open, value]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openSelector() {
    setDisplayYear(Number(value.slice(0, 4)));
    setOpen(true);
  }

  function selectMonth(month: string) {
    onChange(month);
    closeAndRestoreFocus();
  }

  function focusMonth(month: string | undefined) {
    if (!month || !isWithinBounds(month, validMin, validMax)) return;
    setDisplayYear(Number(month.slice(0, 4)));
    window.requestAnimationFrame(() => monthRefs.current[month]?.focus());
  }

  function moveFocus(month: string, amount: number) {
    let candidate = shiftMonth(month, amount);
    const direction = amount > 0 ? 1 : -1;

    while (!isWithinBounds(candidate, validMin, validMax)) {
      candidate = shiftMonth(candidate, direction);
      if ((validMin && candidate < validMin) || (validMax && candidate > validMax)) return;
    }

    focusMonth(candidate);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const activeMonth = (document.activeElement as HTMLElement | null)?.dataset.month;
    if (!activeMonth) return;

    const movement =
      event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp"
            ? -3
            : event.key === "ArrowDown"
              ? 3
              : undefined;
    if (movement !== undefined) {
      event.preventDefault();
      moveFocus(activeMonth, movement);
      return;
    }

    let nextMonth: string | undefined;
    if (event.key === "PageUp") nextMonth = shiftMonth(activeMonth, -12);
    if (event.key === "PageDown") nextMonth = shiftMonth(activeMonth, 12);
    if (event.key === "Home") nextMonth = firstAvailableMonth(displayYear, validMin, validMax);
    if (event.key === "End") nextMonth = lastAvailableMonth(displayYear, validMin, validMax);

    if (!nextMonth) return;
    event.preventDefault();
    focusMonth(nextMonth);
  }

  return (
    <div ref={wrapperRef} className={["month-selector", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        className="month-selector-trigger"
        type="button"
        aria-label={`${label}: ${formatFullMonth(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => (open ? setOpen(false) : openSelector())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openSelector();
          }
        }}
      >
        <CalendarDays size={17} aria-hidden="true" />
        <span>{formatFullMonth(value)}</span>
      </button>
      {open && (
        <div
          id={popoverId}
          className="month-selector-popover"
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          onKeyDown={handleGridKeyDown}
        >
          <div className="month-selector-year">
            <button
              type="button"
              aria-label={`Show ${displayYear - 1}`}
              disabled={!canShowPreviousYear}
              onClick={() => setDisplayYear((year) => year - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong>{displayYear}</strong>
            <button
              type="button"
              aria-label={`Show ${displayYear + 1}`}
              disabled={!canShowNextYear}
              onClick={() => setDisplayYear((year) => year + 1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="month-selector-grid" role="group" aria-label={`${displayYear} months`}>
            {MONTH_NAMES.map((name, index) => {
              const month = monthForYear(displayYear, index);
              const selected = month === value;
              const disabled = !isWithinBounds(month, validMin, validMax);

              return (
                <button
                  key={month}
                  ref={(element) => {
                    monthRefs.current[month] = element;
                  }}
                  type="button"
                  className="month-selector-option"
                  data-month={month}
                  aria-label={`${name} ${displayYear}`}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => selectMonth(month)}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
