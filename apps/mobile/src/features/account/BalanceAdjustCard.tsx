import {
  currencies,
  currencyMetadata,
  heldCurrencies,
  holdsMultipleCurrencies,
  isCurrency,
  type Currency,
  type CurrencyTotals,
} from "@zoption/shared";
import { Text, View } from "react-native";

import { Button, Card, FormField, MoneyValue, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import {
  computeBalanceAdjustment,
  emptyBalanceDraft,
  formatAdjustmentPreview,
  resolveBalanceDraft,
  type BalanceDraft,
} from "./balance-adjustment";

/**
 * "Adjust current balance" in the account editor. Lists each held balance with the one being
 * adjusted highlighted, and previews the Old → New change. The editor owns the draft and its
 * "Save changes" books the delta as an Uncategorized adjustment, so there is no second button
 * here. A bank account adjusts the held currency chosen in the editor's Currency field
 * (`selectedCurrency`), and "Add new currency" opens a balance in one it does not hold yet (a
 * USD balance in a PHP bank account) by booking its opening balance.
 */
export function BalanceAdjustCard({
  accountType,
  accountCurrency,
  balancesByCurrency,
  selectedCurrency,
  draft,
  onDraftChange,
  disabled,
}: {
  accountType: string;
  accountCurrency: Currency;
  balancesByCurrency: CurrencyTotals;
  selectedCurrency?: Currency;
  draft: BalanceDraft;
  onDraftChange: (draft: BalanceDraft) => void;
  disabled?: boolean;
}) {
  const theme = useZoptionTheme();
  const multiCurrency = holdsMultipleCurrencies(accountType);
  const held = heldCurrencies({ currency: accountCurrency, balancesByCurrency });
  const addable = currencies.filter((code) => !held.includes(code));
  const { currency, currentBalanceMinor, newBalanceMinor } = resolveBalanceDraft({
    accountType,
    accountCurrency,
    balancesByCurrency,
    selectedCurrency,
    draft,
  });
  const preview =
    newBalanceMinor == null ? null : computeBalanceAdjustment(currentBalanceMinor, newBalanceMinor);

  return (
    <Card accessibilityLabel="Adjust current balance">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          {draft.adding ? "Add a currency balance" : "Adjust current balance"}
        </Text>
        <View className="gap-1" accessibilityLabel="Balances by currency">
          {held.map((code) => {
            const selected = !draft.adding && code === currency;
            const color = selected ? theme.colors.brand : theme.colors.textMuted;
            return (
              <View
                key={code}
                accessibilityState={{ selected }}
                className="flex-row items-center justify-between"
              >
                <Text style={[selected ? typography.label : typography.callout, { color }]}>
                  {code}
                </Text>
                <MoneyValue
                  amountMinor={balancesByCurrency[code] ?? 0}
                  currency={code}
                  style={[typography.label, { color: selected ? color : theme.colors.text }]}
                />
              </View>
            );
          })}
        </View>
        {draft.adding ? (
          <SelectionField
            disabled={disabled}
            hint="The account keeps a separate balance for each currency."
            label="New currency"
            onSelect={(code) => {
              if (isCurrency(code)) onDraftChange({ ...draft, newCurrency: code });
            }}
            options={addable.map((code) => ({ id: code, label: currencyMetadata[code].label }))}
            placeholder="Choose a currency"
            sheetTitle="Add new currency"
            value={draft.newCurrency ?? ""}
          />
        ) : null}
        <FormField
          label={draft.adding ? "Opening balance" : "New balance"}
          value={draft.amount}
          onChangeText={(amount) => onDraftChange({ ...draft, amount })}
          placeholder="0.00"
          inputMode="decimal"
          keyboardType="decimal-pad"
          hint={`Preview ${formatAdjustmentPreview(currentBalanceMinor, newBalanceMinor ?? currentBalanceMinor)}. Saved with your changes.`}
          error={
            newBalanceMinor === null
              ? "Enter a valid amount with no more than two decimal places."
              : undefined
          }
          editable={!disabled}
        />
        {currency && preview && preview.kind ? (
          <View className="flex-row flex-wrap items-center">
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Delta </Text>
            <MoneyValue
              amountMinor={preview.deltaMinor}
              currency={currency}
              tone={preview.kind === "income" ? "income" : "expense"}
              style={typography.label}
            />
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {preview.kind === "income" ? " booked as income" : " booked as expense"}
            </Text>
          </View>
        ) : null}
        {multiCurrency && !draft.adding && addable.length > 0 ? (
          <Button
            variant="quiet"
            icon="plus"
            disabled={disabled}
            onPress={() => onDraftChange({ ...emptyBalanceDraft, adding: true })}
          >
            Add new currency
          </Button>
        ) : null}
        {draft.adding ? (
          <Button
            variant="quiet"
            disabled={disabled}
            onPress={() => onDraftChange(emptyBalanceDraft)}
          >
            Cancel
          </Button>
        ) : null}
      </View>
    </Card>
  );
}
