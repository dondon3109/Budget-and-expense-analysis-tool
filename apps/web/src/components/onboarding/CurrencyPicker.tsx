import { currencies, currencyMetadata, type Currency } from "@zoption/shared";
import { useEffect, useId, useRef, useState } from "react";

import "./CurrencyPicker.css";

/**
 * Dropdown currency choice. The trigger always shows the current pick with a check, and the
 * panel holds a search box over the list; picking a row closes it.
 */
export function CurrencyPicker({
  value,
  onChange,
  disabled,
  describedBy,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = currencies.filter(
    (code) =>
      !needle ||
      code.toLowerCase().includes(needle) ||
      currencyMetadata[code].name.toLowerCase().includes(needle),
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function pick(code: Currency) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  const { name, symbol } = currencyMetadata[value];

  return (
    <div
      className="currency-picker"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <span id={`${id}-label`} className="currency-picker-label">
        Base currency
      </span>
      <button
        type="button"
        className="currency-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="currency-picker-check" aria-hidden="true">
          ✓
        </span>
        <span id={`${id}-value`} className="currency-picker-value">
          <strong>{value}</strong> {name}
        </span>
        <span className="currency-picker-symbol" aria-hidden="true">
          {symbol}
        </span>
        <span className="currency-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="currency-picker-panel">
          <input
            ref={searchRef}
            type="search"
            className="currency-picker-search"
            placeholder="Search by code or name"
            aria-label="Search currencies"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div role="radiogroup" aria-labelledby={`${id}-label`} className="currency-picker-list">
            {matches.map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={code === value}
                className="currency-picker-option"
                onClick={() => pick(code)}
              >
                <span className="currency-picker-code">{code}</span>
                <span className="currency-picker-name">{currencyMetadata[code].name}</span>
                <span className="currency-picker-symbol" aria-hidden="true">
                  {currencyMetadata[code].symbol}
                </span>
                {code === value ? (
                  <span className="currency-picker-check" aria-hidden="true">
                    ✓
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
              </button>
            ))}
            {matches.length === 0 && <p className="currency-picker-empty">No currency matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
