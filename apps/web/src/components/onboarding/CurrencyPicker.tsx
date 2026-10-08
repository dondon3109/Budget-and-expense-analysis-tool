import { currencies, currencyMetadata, type Currency } from "@zoption/shared";
import { useId, useState } from "react";

import "./CurrencyPicker.css";

/** Searchable single-choice currency list: type a code or name, then tap a row. */
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
  const searchId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = currencies.filter(
    (code) =>
      !needle ||
      code.toLowerCase().includes(needle) ||
      currencyMetadata[code].name.toLowerCase().includes(needle),
  );

  return (
    <div className="currency-picker">
      <label id={`${searchId}-label`} htmlFor={searchId} className="currency-picker-label">
        Base currency
      </label>
      <input
        id={searchId}
        type="search"
        className="currency-picker-search"
        placeholder="Search by code or name"
        autoComplete="off"
        value={query}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="radiogroup" aria-labelledby={`${searchId}-label`} className="currency-picker-list">
        {matches.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === value}
            disabled={disabled}
            className="currency-picker-option"
            onClick={() => onChange(code)}
          >
            <span className="currency-picker-code">{code}</span>
            <span className="currency-picker-name">{currencyMetadata[code].name}</span>
            <span className="currency-picker-symbol" aria-hidden="true">
              {currencyMetadata[code].symbol}
            </span>
          </button>
        ))}
        {matches.length === 0 && <p className="currency-picker-empty">No currency matches.</p>}
      </div>
    </div>
  );
}
