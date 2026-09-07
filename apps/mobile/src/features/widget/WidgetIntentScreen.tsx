import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { transactionInputSchema } from "@zoption/shared";

import { useDashboardData, useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, ErrorState, FormField, MoneyValue, SelectionField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";
import {
  formatMinorForInput,
  localCalendarDate,
} from "@/features/transactions/transaction-form";
import {
  buildBalanceAdjustmentInput,
  computeBalanceAdjustment,
  resolveAdjustmentCategoryId,
  undoBalanceAdjustment,
} from "@/features/account/balance-adjustment";

import {
  parseWidgetIntentPayload,
  parseWidgetTranscriptToIntent,
  resolveWidgetAccount,
  resolveWidgetCategory,
  type WidgetExpenseIntent,
  type WidgetIntent,
} from "./widget-intent";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function widgetErrorMessage(code: string | undefined): string {
  if (code === "stt_unavailable") {
    return "Voice input isn't available on this device right now. Use “Speak a transaction” inside the app instead.";
  }
  if (code === "no_speech") {
    return "No speech was recognized. Tap the widget mic and try again.";
  }
  return "That voice note could not be understood as an expense or a balance update.";
}

type ResolvedIntent =
  | { status: "failed"; message: string; transcript: string | null }
  | { status: "ready"; intent: WidgetIntent; interpreted: boolean; transcript: string | null };

function useResolvedIntent(): ResolvedIntent {
  const params = useLocalSearchParams<{ payload?: string | string[]; transcript?: string | string[]; error?: string | string[] }>();
  return useMemo(() => {
    const transcript = single(params.transcript)?.trim() || null;
    const error = single(params.error);
    if (error) {
      return { status: "failed" as const, message: widgetErrorMessage(error), transcript };
    }
    const payload = single(params.payload);
    if (payload) {
      const parsed = parseWidgetIntentPayload(payload);
      if (parsed.ok) return { status: "ready" as const, intent: parsed.intent, interpreted: false, transcript };
    }
    if (transcript) {
      const fallback = parseWidgetTranscriptToIntent(transcript);
      if (fallback) return { status: "ready" as const, intent: fallback, interpreted: true, transcript };
    }
    return {
      status: "failed" as const,
      message: widgetErrorMessage(undefined),
      transcript,
    };
  }, [params.payload, params.transcript, params.error]);
}

function ExpenseConfirm({ intent }: { intent: WidgetExpenseIntent }) {
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const formData = useTransactionFormData();
  const [description, setDescription] = useState(intent.merchant);
  const [amount, setAmount] = useState(formatMinorForInput(intent.amountMinor));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const accounts = useMemo(() => formData.data?.accounts.filter((item) => !item.pending) ?? [], [formData.data]);
  const categories = useMemo(
    () => formData.data?.categories.filter((item) => item.kind === "expense" && !item.pending) ?? [],
    [formData.data],
  );
  const resolvedAccountId =
    accountId ?? resolveWidgetAccount(accounts, intent.account) ?? accounts[0]?.id ?? "";
  const resolvedCategoryId =
    categoryId ??
    resolveWidgetCategory(categories, "expense", intent.category) ??
    "";
  const account = accounts.find((item) => item.id === resolvedAccountId);

  const confirm = async (): Promise<void> => {
    if (!local.workspace || saving || saved) return;
    setSaving(true);
    setMessage(null);
    try {
      let amountMinor = 0;
      try {
        amountMinor = parseAmountInput(amount);
      } catch {
        setMessage("Enter a valid amount with no more than two decimal places.");
        return;
      }
      const parsed = transactionInputSchema.safeParse({
        kind: "expense",
        accountId: resolvedAccountId,
        categoryId: resolvedCategoryId,
        date: localCalendarDate(),
        description: description.trim(),
        amountMinor,
        currency: account?.currency ?? "PHP",
      });
      if (!parsed.success || !resolvedAccountId || !resolvedCategoryId) {
        setMessage("Check the highlighted details before saving.");
        return;
      }
      // Same local pipeline as TransactionVoiceEntry drafts: review here, then
      // persist through the existing transaction mutation path.
      await local.workspace.transactionMutations.createTransaction(parsed.data);
      setSaved(true);
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The transaction could not be saved to encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (formData.error || !formData.data) {
    return (
      <ErrorState
        title="Voice expense unavailable"
        message={formData.error ?? "Reading accounts from encrypted storage."}
        onRetry={formData.error ? formData.retry : undefined}
      />
    );
  }

  if (saved) {
    return (
      <Card accessibilityLabel="Expense saved">
        <View className="gap-3">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Expense saved</Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            Your voice note is now in the ledger.
          </Text>
          <Button onPress={() => router.replace("/(app)/(tabs)/transactions")}>
            View transactions
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card accessibilityLabel="Confirm voice expense">
      <View className="gap-4">
        <Text style={[typography.headline, { color: theme.colors.text }]}>Confirm expense</Text>
        <FormField label="Description" value={description} onChangeText={setDescription} maxLength={240} editable={!saving} />
        <FormField
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          inputMode="decimal"
          keyboardType="decimal-pad"
          editable={!saving}
        />
        <SelectionField
          label="Account"
          value={resolvedAccountId}
          options={accounts.map((item) => ({ id: item.id, label: item.name, detail: item.currency }))}
          placeholder="Choose an account"
          sheetTitle="Account"
          disabled={saving}
          onSelect={setAccountId}
        />
        <SelectionField
          label="Category"
          value={resolvedCategoryId}
          options={categories.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Choose a category"
          sheetTitle="Category"
          disabled={saving}
          onSelect={setCategoryId}
        />
        {message ? (
          <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
            {message}
          </Text>
        ) : null}
        <Button loading={saving} disabled={saving} onPress={() => void confirm()}>
          Save expense
        </Button>
      </View>
    </Card>
  );
}

function parseAmountInput(value: string): number {
  const normalized = value.replaceAll(",", "").trim();
  const [whole, fraction = ""] = normalized.split(".");
  if (!/^\d+$/.test(whole ?? "") || !/^\d{0,2}$/.test(fraction)) {
    throw new Error("Enter a valid amount with no more than two decimal places.");
  }
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function ReconcileConfirm({
  accountName,
  newBalanceMinor,
}: {
  accountName: string;
  newBalanceMinor: number;
}) {
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const formData = useTransactionFormData();
  const dashboard = useDashboardData();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adjustmentId, setAdjustmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const accounts = useMemo(() => formData.data?.accounts.filter((item) => !item.pending) ?? [], [formData.data]);
  const resolvedAccountId =
    accountId ?? resolveWidgetAccount(accounts, accountName) ?? "";
  const balances = useMemo(() => {
    const items = dashboard.data?.accounts ?? [];
    return new Map(items.map((item) => [item.id, item.balanceMinor ?? 0]));
  }, [dashboard.data]);
  const account = accounts.find((item) => item.id === resolvedAccountId);
  const currentBalanceMinor = resolvedAccountId ? (balances.get(resolvedAccountId) ?? 0) : 0;
  const preview = computeBalanceAdjustment(currentBalanceMinor, newBalanceMinor);

  const confirm = async (): Promise<void> => {
    if (!local.workspace || saving || !resolvedAccountId || !account) return;
    setSaving(true);
    setMessage(null);
    try {
      if (preview.kind === null) {
        setMessage("The balance already matches this amount.");
        return;
      }
      const categoryId = resolveAdjustmentCategoryId(
        formData.data?.categories ?? [],
        preview.kind,
      );
      if (!categoryId) {
        setMessage("No category is available to book this adjustment.");
        return;
      }
      const input = buildBalanceAdjustmentInput({
        accountId: resolvedAccountId,
        accountName: account.name,
        categoryId,
        currency: account.currency,
        currentBalanceMinor,
        newBalanceMinor,
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
      setSaving(false);
    }
  };

  const undo = async (): Promise<void> => {
    if (!local.workspace || saving || !adjustmentId) return;
    setSaving(true);
    setMessage(null);
    try {
      await undoBalanceAdjustment(local.workspace.transactionMutations, adjustmentId);
      setAdjustmentId(null);
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The adjustment could not be undone from encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (formData.error || !formData.data) {
    return (
      <ErrorState
        title="Balance update unavailable"
        message={formData.error ?? "Reading accounts from encrypted storage."}
        onRetry={formData.error ? formData.retry : undefined}
      />
    );
  }

  return (
    <Card accessibilityLabel="Confirm balance update">
      <View className="gap-4">
        <Text style={[typography.headline, { color: theme.colors.text }]}>Confirm balance update</Text>
        <SelectionField
          label="Account"
          value={resolvedAccountId}
          options={accounts.map((item) => ({ id: item.id, label: item.name, detail: item.currency }))}
          placeholder="Choose an account"
          sheetTitle="Account"
          disabled={saving || adjustmentId !== null}
          onSelect={setAccountId}
        />
        {resolvedAccountId && account ? (
          <View className="flex-row flex-wrap items-center">
            <MoneyValue amountMinor={currentBalanceMinor} currency={account.currency} />
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}> → </Text>
            <MoneyValue amountMinor={newBalanceMinor} currency={account.currency} />
            {preview.kind ? (
              <>
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}> (</Text>
                <MoneyValue
                  amountMinor={preview.deltaMinor}
                  currency={account.currency}
                  tone={preview.kind === "income" ? "income" : "expense"}
                />
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>)</Text>
              </>
            ) : null}
          </View>
        ) : (
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            “{accountName}” did not match an account. Choose the account to update.
          </Text>
        )}
        {message ? (
          <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
            {message}
          </Text>
        ) : null}
        {adjustmentId ? (
          <>
            <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.brand }]}>
              Balance updated with an Uncategorized adjustment.
            </Text>
            <Button variant="secondary" disabled={saving} loading={saving} onPress={() => void undo()}>
              Undo adjustment
            </Button>
          </>
        ) : (
          <Button
            loading={saving}
            disabled={saving || !resolvedAccountId || preview.kind === null}
            onPress={() => void confirm()}
          >
            Update balance
          </Button>
        )}
      </View>
    </Card>
  );
}

export function WidgetIntentScreen() {
  const theme = useZoptionTheme();
  const resolved = useResolvedIntent();

  if (resolved.status === "failed") {
    return (
      <Screen title="Voice widget" description="Review a voice note from the home-screen mic">
        <ErrorState
          title="Voice note unclear"
          message={resolved.message}
          onRetry={undefined}
        />
        {resolved.transcript ? (
          <Card accessibilityLabel="Heard transcript">
            <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
              Heard: “{resolved.transcript}”
            </Text>
            <Button variant="secondary" onPress={() => router.replace("/(app)/transaction")}>
              Open transaction form
            </Button>
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="Voice widget" description="Review a voice note from the home-screen mic">
      {resolved.interpreted ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          Interpreted from “{resolved.transcript}”. Review before saving.
        </Text>
      ) : null}
      {resolved.intent.type === "expense" ? (
        <ExpenseConfirm intent={resolved.intent} />
      ) : (
        <ReconcileConfirm
          accountName={resolved.intent.account}
          newBalanceMinor={resolved.intent.newBalanceMinor}
        />
      )}
    </Screen>
  );
}
