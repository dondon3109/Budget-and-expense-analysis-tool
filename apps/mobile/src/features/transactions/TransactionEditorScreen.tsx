import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import {
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  FormField,
  SelectionField,
  Skeleton,
} from "@/ui/components";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import {
  formatMinorForInput,
  localCalendarDate,
  parseTransactionForm,
  type TransactionFormErrors,
  type TransactionFormKind,
  type TransactionFormValues,
} from "./transaction-form";

const emptyForm: TransactionFormValues = {
  kind: "expense",
  accountId: "",
  categoryId: "",
  date: localCalendarDate(),
  description: "",
  amount: "",
  currency: "PHP",
  notes: "",
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function KindSelector({
  value,
  disabled,
  onChange,
}: {
  value: TransactionFormKind;
  disabled?: boolean;
  onChange: (kind: TransactionFormKind) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>Type</Text>
      <View
        accessibilityRole="radiogroup"
        className="flex-row"
        style={[styles.segmentGroup, { backgroundColor: theme.colors.canvasMuted }]}
      >
        {(["expense", "income"] as const).map((kind) => {
          const selected = value === kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
              disabled={disabled}
              onPress={() => onChange(kind)}
              style={[
                styles.segment,
                {
                  backgroundColor: selected ? theme.colors.surfaceRaised : "transparent",
                  borderColor: selected ? theme.colors.border : "transparent",
                  opacity: disabled ? 0.55 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={selected ? theme.colors.brand : theme.colors.textMuted}
                name={kind === "expense" ? "arrow-up-right" : "arrow-down-left"}
                size={19}
              />
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.colors.text : theme.colors.textMuted },
                ]}
              >
                {kind === "expense" ? "Expense" : "Income"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function TransactionEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = singleParam(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const sync = useSyncState();
  const formData = useTransactionFormData(id);
  const theme = useZoptionTheme();
  const initializedFor = useRef<string | null>(null);
  const [values, setValues] = useState<TransactionFormValues>(emptyForm);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!formData.data) return;
    const key = id ?? "new";
    if (initializedFor.current === key) return;
    if (id && !formData.data.transaction) return;
    const existing = formData.data.transaction?.input;
    const account = existing
      ? formData.data.accounts.find((item) => item.id === existing.accountId)
      : formData.data.accounts[0];
    const kind = existing?.kind ?? "expense";
    const category = existing
      ? formData.data.categories.find((item) => item.id === existing.categoryId)
      : formData.data.categories.find((item) => item.kind === kind);
    setValues({
      kind,
      accountId: account?.id ?? existing?.accountId ?? "",
      categoryId: category?.id ?? existing?.categoryId ?? "",
      date: existing?.date ?? localCalendarDate(),
      description: existing?.description ?? "",
      amount: existing ? formatMinorForInput(existing.amountMinor) : "",
      currency: existing?.currency ?? account?.currency ?? "PHP",
      notes: existing?.notes ?? "",
    });
    initializedFor.current = key;
  }, [formData.data, id]);

  const blockedState = formData.data?.transaction?.syncState;
  const mutationBlocked = blockedState === "failed" || blockedState === "conflicted";
  const categories = useMemo(
    () => formData.data?.categories.filter((category) => category.kind === values.kind) ?? [],
    [formData.data?.categories, values.kind],
  );
  const accountOptions =
    formData.data?.accounts.map((account) => ({
      id: account.id,
      label: account.name,
      detail: account.currency,
    })) ?? [];
  const categoryOptions = categories.map((category) => ({
    id: category.id,
    label: category.name,
    color: category.color,
  }));

  const updateValue = <Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key],
  ): void => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage(null);
  };

  const save = async (): Promise<void> => {
    if (!local.workspace || saving || mutationBlocked) return;
    const parsed = parseTransactionForm(values);
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (id) {
        await local.workspace.transactionMutations.updateTransaction(id, {
          ...parsed.input,
          notes: parsed.input.notes ?? "",
        });
      } else {
        await local.workspace.transactionMutations.createTransaction(parsed.input);
      }
      router.back();
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

  const remove = async (): Promise<void> => {
    if (!id || !local.workspace || saving || mutationBlocked) return;
    setConfirmDelete(false);
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.deleteTransaction(id);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The transaction could not be deleted from encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  const title = editing ? "Edit transaction" : "New transaction";
  if (formData.error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title }} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Transaction unavailable"
            message={formData.error}
            onRetry={formData.retry}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (!formData.data) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title }} />
        <View accessibilityLabel="Loading transaction editor" className="gap-4 px-4 pt-6">
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      </SafeAreaView>
    );
  }
  if (formData.data.unavailableReason) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title }} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Cannot edit this transaction"
            message={formData.data.unavailableReason}
          />
        </View>
      </SafeAreaView>
    );
  }

  const hasChoices = accountOptions.length > 0 && categoryOptions.length > 0;
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: theme.colors.canvas }]}
    >
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0}
        style={styles.safe}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {blockedState === "conflicted" ? (
            <Card style={{ backgroundColor: theme.colors.warningSoft }}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Conflict preserved
              </Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Zoption kept both versions. Editing stays disabled until conflict resolution is
                available.
              </Text>
              {id ? (
                <Button
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/transaction-conflict",
                      params: { id },
                    })
                  }
                  variant="secondary"
                >
                  Review conflict
                </Button>
              ) : null}
            </Card>
          ) : blockedState === "failed" ? (
            <Card style={{ backgroundColor: theme.colors.dangerSoft }}>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Sync needs repair
              </Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                This saved operation was rejected and remains protected on this device.
              </Text>
            </Card>
          ) : blockedState === "pending" ? (
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={theme.colors.warning}
                name="cloud-upload-outline"
                size={18}
              />
              <Text style={[typography.caption, { color: theme.colors.warning }]}>
                Pending sync
              </Text>
            </View>
          ) : null}

          {!hasChoices ? (
            <Card>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Account setup needed
              </Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Synchronize at least one active account and an available {values.kind} category
                before saving.
              </Text>
            </Card>
          ) : null}

          <KindSelector
            value={values.kind}
            disabled={saving || mutationBlocked}
            onChange={(kind) => {
              const firstCategory = formData.data?.categories.find(
                (category) => category.kind === kind,
              );
              setValues((current) => ({
                ...current,
                kind,
                categoryId: firstCategory?.id ?? "",
              }));
              setErrors((current) => ({ ...current, categoryId: undefined }));
              setMessage(null);
            }}
          />
          <FormField
            autoCapitalize="sentences"
            autoCorrect
            editable={!saving && !mutationBlocked}
            error={errors.description}
            label="Description"
            maxLength={240}
            onChangeText={(value) => updateValue("description", value)}
            placeholder="What was this for?"
            returnKeyType="next"
            value={values.description}
          />
          <FormField
            editable={!saving && !mutationBlocked}
            error={errors.amount}
            keyboardType="decimal-pad"
            label="Amount"
            maxLength={18}
            onChangeText={(value) => updateValue("amount", value)}
            placeholder="0.00"
            trailing={
              <Text style={[typography.label, { color: theme.colors.textMuted }]}>
                {values.currency}
              </Text>
            }
            value={values.amount}
          />
          <SelectionField
            disabled={saving || mutationBlocked}
            error={errors.accountId}
            label="Account"
            onSelect={(accountId) => {
              const account = formData.data?.accounts.find((item) => item.id === accountId);
              setValues((current) => ({
                ...current,
                accountId,
                currency: account?.currency ?? current.currency,
              }));
              setErrors((current) => ({ ...current, accountId: undefined }));
              setMessage(null);
            }}
            options={accountOptions}
            placeholder="Choose an account"
            sheetTitle="Choose account"
            value={values.accountId}
          />
          <SelectionField
            disabled={saving || mutationBlocked}
            error={errors.categoryId}
            label="Category"
            onSelect={(categoryId) => updateValue("categoryId", categoryId)}
            options={categoryOptions}
            placeholder="Choose a category"
            sheetTitle={`Choose ${values.kind} category`}
            value={values.categoryId}
          />
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving && !mutationBlocked}
            error={errors.date}
            hint="Use YYYY-MM-DD."
            keyboardType="numbers-and-punctuation"
            label="Date"
            maxLength={10}
            onChangeText={(value) => updateValue("date", value)}
            placeholder="YYYY-MM-DD"
            value={values.date}
          />
          <FormField
            autoCapitalize="sentences"
            editable={!saving && !mutationBlocked}
            error={errors.notes}
            label="Notes (optional)"
            maxLength={500}
            multiline
            onChangeText={(value) => updateValue("notes", value)}
            placeholder="Add context for yourself"
            style={styles.notes}
            textAlignVertical="top"
            value={values.notes}
          />

          {message ? (
            <Text
              accessibilityRole="alert"
              style={[typography.callout, { color: theme.colors.danger }]}
            >
              {message}
            </Text>
          ) : null}
          <Button
            accessibilityLabel={editing ? "Save transaction changes" : "Save new transaction"}
            disabled={!hasChoices || mutationBlocked}
            loading={saving}
            onPress={() => void save()}
          >
            {editing ? "Save changes" : "Save transaction"}
          </Button>
          {editing ? (
            <Button
              accessibilityLabel="Delete transaction"
              disabled={mutationBlocked}
              onPress={() => setConfirmDelete(true)}
              variant="quiet"
            >
              Delete transaction
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmationDialog
        confirmLabel="Delete"
        destructive
        message="This removes the transaction from this device. If it was already synchronized, Zoption queues the deletion for the server."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete transaction?"
        visible={confirmDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  segmentGroup: {
    width: "100%",
    borderRadius: radii.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  notes: { minHeight: 104 },
});
