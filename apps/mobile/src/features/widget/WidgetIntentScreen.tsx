import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { matchCategory, transactionInputSchema } from "@zoption/shared";

import { useDashboardData, useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, ErrorState, FormField, MoneyValue, SelectionField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
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
  resolveKnownBalanceMinor,
  resolveWidgetAccount,
  resolveWidgetAccountFromTranscript,
  resolveWidgetCategory,
  summarizeWidgetDescription,
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

function ExpenseConfirm({
  intent,
  transcript,
}: {
  intent: WidgetExpenseIntent;
  transcript: string | null;
}) {
  const theme = useZoptionTheme();
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const formData = useTransactionFormData();

  const accounts = useMemo(() => formData.data?.accounts.filter((item) => !item.pending) ?? [], [formData.data]);
  const categories = useMemo(
    () => formData.data?.categories.filter((item) => item.kind === "expense" && !item.pending) ?? [],
    [formData.data],
  );

  const [description, setDescription] = useState(() =>
    summarizeWidgetDescription(intent.merchant, accounts.map((a) => a.name)),
  );

  useEffect(() => {
    if (accounts.length > 0) {
      setDescription((current) => {
        if (current === intent.merchant) {
          return summarizeWidgetDescription(intent.merchant, accounts.map((a) => a.name));
        }
        return current;
      });
    }
  }, [accounts, intent.merchant]);

  const [amount, setAmount] = useState(formatMinorForInput(intent.amountMinor));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dismiss = (): void => {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/(tabs)/transactions");
    }
  };

  // The native widget only parses the amount and merchant, so the account and
  // category the speaker actually named ("... dinner today using cash") are
  // recovered here: the account from the speaker's own account names in the
  // transcript, the category from the shared semantic matcher.
  const suggestedCategory = useMemo(
    () =>
      matchCategory(categories, intent.category ?? null, {
        kind: "expense",
        contextText: transcript ?? intent.merchant,
      }),
    [categories, intent.category, intent.merchant, transcript],
  );
  const resolvedAccountId =
    accountId ??
    resolveWidgetAccount(accounts, intent.account) ??
    resolveWidgetAccountFromTranscript(accounts, transcript) ??
    accounts[0]?.id ??
    "";
  const resolvedCategoryId =
    categoryId ??
    suggestedCategory?.id ??
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
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: radii.round,
                backgroundColor: theme.colors.brandSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={24}
                color={theme.colors.brand}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text style={[typography.headline, { color: theme.colors.text }]}>Expense saved</Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Your voice note is now in the ledger.
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Button onPress={() => router.replace("/(app)/(tabs)/transactions")}>
                View transactions
              </Button>
            </View>
            <Button variant="secondary" onPress={dismiss}>
              Done
            </Button>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card accessibilityLabel="Confirm voice expense">
      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Confirm expense</Text>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
              borderRadius: radii.sm,
              backgroundColor: theme.colors.brandSoft,
            }}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Voice Draft
            </Text>
          </View>
        </View>
        <FormField
          label="Description"
          value={description}
          onChangeText={setDescription}
          maxLength={240}
          editable={!saving}
        />
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
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Button loading={saving} disabled={saving} onPress={() => void confirm()}>
              Save expense
            </Button>
          </View>
          <Button variant="secondary" disabled={saving} onPress={dismiss}>
            Cancel
          </Button>
        </View>
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

/** Current to new balance with the booked delta. Requires a known balance. */
function BalanceDeltaPreview({
  currentBalanceMinor,
  newBalanceMinor,
  currency,
}: {
  currentBalanceMinor: number;
  newBalanceMinor: number;
  currency: "PHP" | "USD";
}) {
  const theme = useZoptionTheme();
  const preview = computeBalanceAdjustment(currentBalanceMinor, newBalanceMinor);
  return (
    <View className="flex-row flex-wrap items-center">
      <MoneyValue amountMinor={currentBalanceMinor} currency={currency} />
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}> → </Text>
      <MoneyValue amountMinor={newBalanceMinor} currency={currency} />
      {preview.kind ? (
        <>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}> (</Text>
          <MoneyValue
            amountMinor={preview.deltaMinor}
            currency={currency}
            tone={preview.kind === "income" ? "income" : "expense"}
          />
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>)</Text>
        </>
      ) : null}
    </View>
  );
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
  const [targetAmountInput, setTargetAmountInput] = useState(() =>
    formatMinorForInput(newBalanceMinor),
  );
  const [saving, setSaving] = useState(false);
  const [adjustmentId, setAdjustmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dismiss = (): void => {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/(tabs)");
    }
  };

  const effectiveNewBalanceMinor = useMemo(() => {
    try {
      return parseAmountInput(targetAmountInput);
    } catch {
      return null;
    }
  }, [targetAmountInput]);

  const accounts = useMemo(() => formData.data?.accounts.filter((item) => !item.pending) ?? [], [formData.data]);
  const resolvedAccountId =
    accountId ?? resolveWidgetAccount(accounts, accountName) ?? "";
  const account = accounts.find((item) => item.id === resolvedAccountId);
  // The dashboard read is the only source of the current balance and settles
  // after the lighter accounts query, so an unread balance stays unknown and
  // the delta stays hidden. Reading it as zero would book the whole target
  // balance as an adjustment.
  const currentBalanceMinor = resolveKnownBalanceMinor(
    dashboard.data?.accounts,
    resolvedAccountId,
  );
  const targetMinor = effectiveNewBalanceMinor ?? newBalanceMinor;
  const balanceAlreadyMatches =
    currentBalanceMinor !== null && currentBalanceMinor === targetMinor;

  const confirm = async (): Promise<void> => {
    if (!local.workspace || saving || !resolvedAccountId || !account) return;
    if (currentBalanceMinor === null) {
      setMessage("The current balance is still loading. Try again in a moment.");
      return;
    }
    if (effectiveNewBalanceMinor === null) {
      setMessage("Enter a valid target balance with no more than two decimal places.");
      return;
    }
    const preview = computeBalanceAdjustment(currentBalanceMinor, effectiveNewBalanceMinor);
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
        newBalanceMinor: effectiveNewBalanceMinor,
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
        <View className="flex-row items-center justify-between">
          <Text style={[typography.headline, { color: theme.colors.text }]}>Confirm balance update</Text>
          <View
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
              borderRadius: radii.sm,
              backgroundColor: theme.colors.brandSoft,
            }}
          >
            <Text style={[typography.caption, { color: theme.colors.brand, fontWeight: "600" }]}>
              Adjust Balance
            </Text>
          </View>
        </View>
        <SelectionField
          label="Account"
          value={resolvedAccountId}
          options={accounts.map((item) => ({ id: item.id, label: item.name, detail: item.currency }))}
          placeholder="Choose an account"
          sheetTitle="Account"
          disabled={saving || adjustmentId !== null}
          onSelect={setAccountId}
        />
        <FormField
          label="Target balance"
          value={targetAmountInput}
          onChangeText={setTargetAmountInput}
          placeholder="0.00"
          inputMode="decimal"
          keyboardType="decimal-pad"
          editable={!saving && adjustmentId === null}
        />
        {resolvedAccountId && account ? (
          currentBalanceMinor === null ? (
            <View className="gap-2">
              <Text
                accessibilityRole="alert"
                style={[typography.callout, { color: theme.colors.textMuted }]}
              >
                {dashboard.error ?? "Reading the current balance from encrypted storage…"}
              </Text>
              {dashboard.error ? (
                <Button variant="secondary" disabled={saving} onPress={dashboard.retry}>
                  Retry balance
                </Button>
              ) : null}
            </View>
          ) : effectiveNewBalanceMinor !== null ? (
            <BalanceDeltaPreview
              currentBalanceMinor={currentBalanceMinor}
              newBalanceMinor={effectiveNewBalanceMinor}
              currency={account.currency}
            />
          ) : null
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
          <View className="gap-3">
            <Text accessibilityRole="alert" style={[typography.body, { color: theme.colors.brand }]}>
              Balance updated with an Uncategorized adjustment.
            </Text>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Button onPress={() => router.replace("/(app)/(tabs)")}>
                  View accounts
                </Button>
              </View>
              <Button variant="secondary" disabled={saving} loading={saving} onPress={() => void undo()}>
                Undo adjustment
              </Button>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Button
                loading={saving}
                disabled={
                  saving ||
                  !resolvedAccountId ||
                  currentBalanceMinor === null ||
                  balanceAlreadyMatches ||
                  effectiveNewBalanceMinor === null
                }
                onPress={() => void confirm()}
              >
                Update balance
              </Button>
            </View>
            <Button variant="secondary" disabled={saving} onPress={dismiss}>
              Cancel
            </Button>
          </View>
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
            <View className="gap-4">
              <View className="flex-row items-center gap-3">
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: radii.round,
                    backgroundColor: theme.colors.brandSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name="microphone-outline"
                    size={20}
                    color={theme.colors.brand}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    Heard
                  </Text>
                  <Text
                    style={[typography.callout, { color: theme.colors.text, fontStyle: "italic" }]}
                  >
                    “{resolved.transcript}”
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Button
                    variant="secondary"
                    onPress={() => router.replace("/(app)/transaction")}
                  >
                    Open transaction form
                  </Button>
                </View>
                <Button
                  variant="secondary"
                  onPress={() => {
                    if (typeof router.canGoBack === "function" && router.canGoBack()) router.back();
                    else router.replace("/(app)/(tabs)/transactions");
                  }}
                >
                  Dismiss
                </Button>
              </View>
            </View>
          </Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="Voice widget" description="Review a voice note from the home-screen mic">
      {resolved.transcript ? (
        <Card accessibilityLabel="Spoken voice note">
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radii.round,
                backgroundColor: theme.colors.brandSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialCommunityIcons
                name="microphone-outline"
                size={20}
                color={theme.colors.brand}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                Voice note heard
              </Text>
              <Text
                style={[typography.callout, { color: theme.colors.text, fontStyle: "italic" }]}
                numberOfLines={3}
              >
                “{resolved.transcript}”
              </Text>
            </View>
          </View>
        </Card>
      ) : null}
      {resolved.intent.type === "expense" ? (
        <ExpenseConfirm intent={resolved.intent} transcript={resolved.transcript} />
      ) : (
        <ReconcileConfirm
          accountName={resolved.intent.account}
          newBalanceMinor={resolved.intent.newBalanceMinor}
        />
      )}
    </Screen>
  );
}
