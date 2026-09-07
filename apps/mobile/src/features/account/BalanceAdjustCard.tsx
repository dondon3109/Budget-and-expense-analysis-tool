import { useState } from "react";
import { Text, View } from "react-native";

import { useLocalReferenceData, useLocalWorkspace } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, FormField, MoneyValue } from "@/ui/components";
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
 * that single adjustment entry.
 */
export function BalanceAdjustCard({
  accountId,
  accountName,
  currency,
  currentBalanceMinor,
  disabled,
}: {
  accountId: string;
  accountName: string;
  currency: "PHP" | "USD";
  currentBalanceMinor: number;
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
  const adjustable = preview !== null && preview.kind !== null && !disabled;

  const adjust = async (): Promise<void> => {
    if (!local.workspace || busy || parsedNewBalance == null) return;
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
          Adjust current balance
        </Text>
        <View className="flex-row flex-wrap items-center">
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>Current </Text>
          <MoneyValue amountMinor={currentBalanceMinor} currency={currency} />
        </View>
        {adjustmentId ? (
          <>
            <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.brand }]}>
              Adjustment saved as an Uncategorized transaction.
            </Text>
            <Button variant="secondary" disabled={busy} loading={busy} onPress={() => void undo()}>
              Undo adjustment
            </Button>
          </>
        ) : (
          <>
            <FormField
              label="New balance"
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
              editable={!busy && !disabled}
            />
            {preview && preview.kind ? (
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
              Adjust balance
            </Button>
          </>
        )}
        {message ? (
          <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
            {message}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
