import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { SubscriptionBillingCycle, SubscriptionStatus } from "@zoption/shared";
import { resolveCategoryEmoji } from "@zoption/shared";

import { useLocalReferenceData, useLocalWorkspace, useSubscription } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  ConfirmationDialog,
  ErrorState,
  FormField,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import {
  billingCycleLabels,
  formatMinorForInput,
  parseSubscriptionForm,
  todayIso,
  type SubscriptionFormErrors,
} from "./subscription-form";

const cycleOptions = (Object.keys(billingCycleLabels) as SubscriptionBillingCycle[]).map(
  (cycle) => ({ id: cycle, label: billingCycleLabels[cycle] }),
);

const statusOptions: Array<{ id: SubscriptionStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "canceled", label: "Canceled" },
];

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function SubscriptionEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = single(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const subscriptionState = useSubscription(id);
  const referenceState = useLocalReferenceData();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const initialized = useRef(false);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<SubscriptionBillingCycle>("monthly");
  const [nextBillingDate, setNextBillingDate] = useState(() => todayIso());
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [errors, setErrors] = useState<SubscriptionFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    if (editing && !subscriptionState.subscription) return;
    if (subscriptionState.subscription) {
      setName(subscriptionState.subscription.name);
      setAmount(formatMinorForInput(subscriptionState.subscription.amountMinor));
      setBillingCycle(subscriptionState.subscription.billingCycle);
      setNextBillingDate(subscriptionState.subscription.nextBillingDate);
      setCategoryId(subscriptionState.subscription.categoryId ?? "");
      setAccountId(subscriptionState.subscription.accountId ?? "");
      setStatus(subscriptionState.subscription.status);
      initialized.current = true;
    } else if (!editing && referenceState.data) {
      const availableCategories = (referenceState.data.categories ?? []).filter(
        (c) => c.kind === "expense" && !c.locked,
      );
      const activeAccounts = referenceState.data.accounts ?? [];
      if (availableCategories.length > 0 && !categoryId) {
        setCategoryId(availableCategories[0]!.id);
      }
      if (activeAccounts.length > 0 && !accountId) {
        setAccountId(activeAccounts[0]!.id);
      }
      initialized.current = true;
    }
  }, [editing, subscriptionState.subscription, referenceState.data, categoryId, accountId]);

  const categoryOptions = useMemo(
    () =>
      (referenceState.data?.categories ?? [])
        .filter((category) => category.kind === "expense" && !category.locked)
        .map((category) => {
          const emoji = resolveCategoryEmoji(category);
          return {
            id: category.id,
            label: emoji ? `${emoji} ${category.name}` : category.name,
          };
        }),
    [referenceState.data],
  );
  const accountOptions = useMemo(
    () =>
      (referenceState.data?.accounts ?? []).map((account) => ({
        id: account.id,
        label: account.currency === "USD" ? `${account.name} (USD)` : account.name,
      })),
    [referenceState.data],
  );

  const blocked =
    editing &&
    (subscriptionState.subscription?.syncState === "failed" ||
      subscriptionState.subscription?.syncState === "conflicted");

  const save = async (): Promise<void> => {
    if (!local.workspace || saving) return;
    const parsed = parseSubscriptionForm({
      name,
      amount,
      billingCycle,
      nextBillingDate,
      categoryId,
      accountId,
    });
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing && id) {
        await local.workspace.transactionMutations.updateSubscription(id, {
          ...parsed.input,
          status,
        });
      } else {
        await local.workspace.transactionMutations.createSubscription(parsed.input);
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The subscription could not be saved to encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!local.workspace || !id || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.deleteSubscription(id);
      setConfirmDelete(false);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The subscription could not be removed from encrypted local storage.",
      );
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title: editing ? "Edit subscription" : "New subscription" }} />
      {subscriptionState.error ? (
        <View style={styles.centered}>
          <ErrorState
            title="Subscription unavailable"
            message={subscriptionState.error}
            onRetry={subscriptionState.retry}
          />
        </View>
      ) : editing && subscriptionState.loading ? (
        <View accessibilityLabel="Loading subscription" style={styles.centered}>
          <Skeleton height={120} />
        </View>
      ) : editing && !subscriptionState.subscription ? (
        <View style={styles.centered}>
          <ErrorState title="Subscription not found" message="This subscription is no longer active on this device." />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.form}>
              <FormField
                editable={!saving}
                error={errors.name}
                label="Subscription name"
                maxLength={120}
                onChangeText={(value) => {
                  setName(value);
                  setErrors((current) => ({ ...current, name: undefined }));
                  setMessage(null);
                }}
                placeholder="Streaming service"
                value={name}
              />
              <FormField
                editable={!saving}
                error={errors.amount}
                keyboardType="decimal-pad"
                label="Charge amount"
                maxLength={18}
                onChangeText={(value) => {
                  setAmount(value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                  setMessage(null);
                }}
                placeholder="0.00"
                trailing={<Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>}
                value={amount}
              />
              <SelectionField
                disabled={saving}
                label="Billing cycle"
                onSelect={(value) => setBillingCycle(value as SubscriptionBillingCycle)}
                options={cycleOptions}
                placeholder="Choose a cycle"
                sheetTitle="Choose a billing cycle"
                value={billingCycle}
              />
              <FormField
                editable={!saving}
                error={errors.nextBillingDate}
                label="Next billing date"
                onChangeText={(value) => {
                  setNextBillingDate(value);
                  setErrors((current) => ({ ...current, nextBillingDate: undefined }));
                  setMessage(null);
                }}
                placeholder="YYYY-MM-DD"
                value={nextBillingDate}
              />
              <SelectionField
                disabled={saving}
                error={errors.categoryId}
                label="Category"
                onSelect={(value) => {
                  setCategoryId(value);
                  setErrors((current) => ({ ...current, categoryId: undefined }));
                  setMessage(null);
                }}
                options={categoryOptions}
                placeholder="Choose an expense category"
                sheetTitle="Choose a category"
                value={categoryId}
              />
              <SelectionField
                disabled={saving}
                error={errors.accountId}
                label="Account"
                onSelect={(value) => {
                  setAccountId(value);
                  setErrors((current) => ({ ...current, accountId: undefined }));
                  setMessage(null);
                }}
                options={accountOptions}
                placeholder="Choose an account"
                sheetTitle="Choose an account"
                value={accountId}
              />
              {editing ? (
                <SelectionField
                  disabled={saving}
                  label="Status"
                  onSelect={(value) => setStatus(value as SubscriptionStatus)}
                  options={statusOptions}
                  placeholder="Choose a status"
                  sheetTitle="Choose a status"
                  value={status}
                />
              ) : null}
              {blocked ? (
                <Text
                  accessibilityRole="alert"
                  style={[typography.callout, { color: theme.colors.warning }]}
                >
                  Resolve this subscription&apos;s synchronization state before editing it.
                </Text>
              ) : null}
              {message ? (
                <Text
                  accessibilityRole="alert"
                  style={[typography.callout, { color: theme.colors.danger }]}
                >
                  {message}
                </Text>
              ) : null}
              <Button
                accessibilityLabel={editing ? "Save subscription changes" : "Save new subscription"}
                disabled={blocked}
                loading={saving}
                onPress={() => void save()}
              >
                {editing ? "Save changes" : "Save subscription"}
              </Button>
              {editing ? (
                <Button
                  accessibilityLabel="Delete this subscription"
                  disabled={blocked || saving}
                  onPress={() => setConfirmDelete(true)}
                  variant="quiet"
                >
                  Delete subscription
                </Button>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmationDialog
        confirmLabel="Delete subscription"
        destructive
        message="This subscription schedule will be removed from your Zoption workspace. Recorded transactions are not changed."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this subscription?"
        visible={confirmDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", padding: spacing.md },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  form: { gap: spacing.md },
});
