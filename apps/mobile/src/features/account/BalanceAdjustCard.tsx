import {
  currencies,
  currencyMetadata,
  heldCurrencies,
  holdsMultipleCurrencies,
  isCurrency,
  type Currency,
  type CurrencyTotals,
} from "@zoption/shared";
import { useState } from "react";
import { Text, View } from "react-native";

import { useLocalReferenceData, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, FormField, MoneyValue, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  formatAdjustmentPreview,
  parseAmountToMinor,
  resolveAdjustmentCategoryId,
  undoBalanceAdjustment,
} from "./balance-adjustment";

/**
 * One-click "Adjust Current Balance" for the account editor. Shows an
 * Old → New preview, books the delta as an Uncategorized Adjustment
 * transaction through the existing mutation path, and offers Undo scoped to
 * that single adjustment entry. A bank account picks which held currency to adjust, and
 * "Add currency" opens a balance in one it does not hold yet (a USD balance in a PHP bank
 * account) by booking its opening balance as that currency's first adjustment.
 */
export function BalanceAdjustCard({
  accountId,
  accountName,
  accountType,
  accountCurrency,
  balancesByCurrency,
  disabled,
}: {
  accountId: string;
  accountName: string;
  accountType: string;
  accountCurrency: Currency;
  balancesByCurrency: CurrencyTotals;
  disabled?: boolean;
}) {
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const references = useLocalReferenceData();
  const sync = useSyncState();
  const [newBalance, setNewBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adjustmentId, setAdjustmentId] = useState<string | null>(null);
  const [heldChoice, setHeldChoice] = useState<Currency>(accountCurrency);
  const [adding, setAdding] = useState(false);
  const [newCurrency, setNewCurrency] = useState<Currency | null>(null);
  const multiCurrency = holdsMultipleCurrencies(accountType);
  const held = heldCurrencies({ currency: accountCurrency, balancesByCurrency });
  const addable = currencies.filter((code) => !held.includes(code));
  const currency: Currency | null = adding
    ? newCurrency
    : multiCurrency
      ? heldChoice
      : accountCurrency;
  const currentBalanceMinor = currency ? (balancesByCurrency[currency] ?? 0) : 0;
  const editable = !busy && !disabled;

  const startAdding = (value: boolean): void => {
    setAdding(value);
    setNewCurrency(null);
    setNewBalance("");
    setMessage(null);
  };

  const parsedNewBalance = (() => {
    if (!newBalance.trim()) return null;
    try {
      return parseAmountToMinor(newBalance);
    } catch {
      return null;
    }
  })();
  const preview =
    parsedNewBalance == null
      ? null
      : computeBalanceAdjustment(currentBalanceMinor, parsedNewBalance);
  const adjustable = currency !== null && preview !== null && preview.kind !== null && !disabled;

  const adjust = async (): Promise<void> => {
    if (!local.workspace || busy || parsedNewBalance == null || !currency) return;
    setBusy(true);
    setMessage(null);
    try {
      const categories = references.data?.categories ?? [];
      const kind = computeBalanceAdjustment(currentBalanceMinor, parsedNewBalance).kind;
      if (kind === null) {
        setMessage("The balance already matches this amount.");
        return;
      }
      const categoryId = resolveAdjustmentCategoryId(categories, kind);
      if (!categoryId) {
        setMessage("No category is available to book this adjustment.");
        return;
      }
      const input = buildBalanceAdjustmentInput({
        accountId,
        accountName,
        categoryId,
        currency,
        currentBalanceMinor,
        newBalanceMinor: parsedNewBalance,
      });
      if (!input) {
        setMessage("The balance already matches this amount.");
        return;
      }
      const id = await local.workspace.transactionMutations.createTransaction(input);
      setAdjustmentId(id);
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The adjustment could not be saved to encrypted local storage.",
      );
    } finally {
      setBusy(false);
    }
  };

  const undo = async (): Promise<void> => {
    if (!local.workspace || busy || !adjustmentId) return;
    setBusy(true);
    setMessage(null);
    try {
      await undoBalanceAdjustment(local.workspace.transactionMutations, adjustmentId);
      setAdjustmentId(null);
      setNewBalance("");
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The adjustment could not be undone from encrypted local storage.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card accessibilityLabel="Adjust current balance">
      <View className="gap-3">
        <Text style={[typography.headline, { color: theme.colors.text }]}>
          {adding ? "Add a currency balance" : "Adjust current balance"}
        </Text>
        {held.length > 1 ? (
          <View className="gap-1" accessibilityLabel="Balances by currency">
            {held.map((code) => (
              <View key={code} className="flex-row flex-wrap items-center">
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>{code} </Text>
                <MoneyValue amountMinor={balancesByCurrency[code] ?? 0} currency={code} />
              </View>
            ))}
          </View>
        ) : null}
        {multiCurrency && !adding && !adjustmentId && held.length > 1 ? (
          <SelectionField
            disabled={!editable}
            label="Currency"
            onSelect={(code) => {
              if (!isCurrency(code)) return;
              setHeldChoice(code);
              setNewBalance("");
              setMessage(null);
            }}
            options={held.map((code) => ({ id: code, label: currencyMetadata[code].label }))}
            placeholder="Choose a currency"
            sheetTitle="Choose currency"
            value={heldChoice}
          />
        ) : null}
        {adding && !adjustmentId ? (
          <SelectionField
            disabled={!editable}
            hint="The account keeps a separate balance for each currency."
            label="New currency"
            onSelect={(code) => {
              if (!isCurrency(code)) return;
              setNewCurrency(code);
              setMessage(null);
            }}
            options={addable.map((code) => ({ id: code, label: currencyMetadata[code].label }))}
            placeholder="Choose a currency"
            sheetTitle="Add currency"
            value={newCurrency ?? ""}
          />
        ) : null}
        {currency && !adding ? (
          <View className="flex-row flex-wrap items-center">
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              {multiCurrency ? `Current ${currency} ` : "Current "}
            </Text>
            <MoneyValue amountMinor={currentBalanceMinor} currency={currency} />
          </View>
        ) : null}
        {adjustmentId ? (
          <>
            <Text
              accessibilityRole="alert"
              style={[typography.body, { color: theme.colors.brand }]}
            >
              Adjustment saved as an Uncategorized transaction.
            </Text>
            <Button variant="secondary" disabled={busy} loading={busy} onPress={() => void undo()}>
              Undo adjustment
            </Button>
          </>
        ) : (
          <>
            <FormField
              label={adding ? "Opening balance" : "New balance"}
              value={newBalance}
              onChangeText={(value) => {
                setNewBalance(value);
                setMessage(null);
              }}
              placeholder="0.00"
              inputMode="decimal"
              keyboardType="decimal-pad"
              hint={`Preview ${formatAdjustmentPreview(currentBalanceMinor, parsedNewBalance ?? currentBalanceMinor)}`}
              error={
                newBalance.trim() && parsedNewBalance == null
                  ? "Enter a valid amount with no more than two decimal places."
                  : undefined
              }
              editable={editable}
            />
            {currency && preview && preview.kind ? (
              <View className="flex-row flex-wrap items-center">
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Delta </Text>
                <MoneyValue
                  amountMinor={preview.deltaMinor}
                  currency={currency}
                  tone={preview.kind === "income" ? "income" : "expense"}
                />
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                  {preview.kind === "income" ? " booked as income" : " booked as expense"}
                </Text>
              </View>
            ) : null}
            <Button
              variant="secondary"
              disabled={!adjustable || busy}
              loading={busy}
              onPress={() => void adjust()}
            >
              {adding ? `Add ${currency ?? "currency"} balance` : "Adjust balance"}
            </Button>
            {multiCurrency && !adding && addable.length > 0 ? (
              <Button
                variant="quiet"
                icon="plus"
                disabled={!editable}
                onPress={() => startAdding(true)}
              >
                Add currency
              </Button>
            ) : null}
            {adding ? (
              <Button variant="quiet" disabled={busy} onPress={() => startAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </>
        )}
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.danger }]}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
