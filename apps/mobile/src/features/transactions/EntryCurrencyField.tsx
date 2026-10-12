import { currencies, currencyMetadata, isCurrency, type Currency } from "@zoption/shared";

import { SelectionField } from "@/ui/components";

const currencyOptions = currencies.map((code) => ({
  id: code,
  label: currencyMetadata[code].label,
}));

/** Picks an entry's currency. Shown only for bank accounts, which hold several currencies. */
export function EntryCurrencyField({
  value,
  disabled,
  onChange,
}: {
  value: Currency;
  disabled: boolean;
  onChange: (currency: Currency) => void;
}) {
  return (
    <SelectionField
      disabled={disabled}
      hint="Bank accounts can hold money in several currencies."
      label="Currency"
      onSelect={(code) => {
        if (isCurrency(code)) onChange(code);
      }}
      options={currencyOptions}
      placeholder="Choose a currency"
      sheetTitle="Choose currency"
      value={value}
    />
  );
}
