import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { DebtStatus, DebtType } from "@zoption/shared";

import { useDebt, useLocalWorkspace } from "@/db/local-workspace-state";
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
import { debtTypeLabels, formatMinorForInput, parseDebtForm, todayIso, type DebtFormErrors } from "./debt-form";

const typeOptions = (Object.keys(debtTypeLabels) as DebtType[]).map((type) => ({
  id: type,
  label: debtTypeLabels[type],
}));

const statusOptions: Array<{ id: DebtStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "paid", label: "Paid off" },
];

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function DebtEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = single(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const debtState = useDebt(id);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const initialized = useRef(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<DebtType>("credit_card");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minimumPayment, setMinimumPayment] = useState("");
  const [balanceAsOf, setBalanceAsOf] = useState(() => todayIso());
  const [status, setStatus] = useState<DebtStatus>("active");
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    if (editing && !debtState.debt) return;
    if (debtState.debt) {
      setName(debtState.debt.name);
      setType(debtState.debt.type);
      setBalance(formatMinorForInput(debtState.debt.balanceMinor));
      setApr(String(debtState.debt.aprBasisPoints / 100));
      setMinimumPayment(formatMinorForInput(debtState.debt.minimumPaymentMinor));
      setBalanceAsOf(debtState.debt.balanceAsOf);
      setStatus(debtState.debt.status);
    }
    initialized.current = true;
  }, [editing, debtState.debt]);

  const blocked =
    editing &&
    (debtState.debt?.syncState === "failed" || debtState.debt?.syncState === "conflicted");

  const save = async (): Promise<void> => {
    if (!local.workspace || saving) return;
    const parsed = parseDebtForm({ name, type, balance, apr, minimumPayment, balanceAsOf });
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing && id) {
        await local.workspace.transactionMutations.updateDebt(id, {
          ...parsed.input,
          status,
        });
      } else {
        await local.workspace.transactionMutations.createDebt({ ...parsed.input, status });
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The debt could not be saved to encrypted local storage.",
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
      await local.workspace.transactionMutations.deleteDebt(id);
      setConfirmDelete(false);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The debt could not be removed from encrypted local storage.",
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
      <Stack.Screen options={{ title: editing ? "Edit debt" : "New debt" }} />
      {debtState.error ? (
        <View style={styles.centered}>
          <ErrorState title="Debt unavailable" message={debtState.error} onRetry={debtState.retry} />
        </View>
      ) : editing && debtState.loading ? (
        <View accessibilityLabel="Loading debt" style={styles.centered}>
          <Skeleton height={120} />
        </View>
      ) : editing && !debtState.debt ? (
        <View style={styles.centered}>
          <ErrorState title="Debt not found" message="This debt is no longer active on this device." />
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
                label="Debt name"
                maxLength={80}
                onChangeText={(value) => {
                  setName(value);
                  setErrors((current) => ({ ...current, name: undefined }));
                  setMessage(null);
                }}
                placeholder="Car loan"
                value={name}
              />
              <SelectionField
                disabled={saving}
                label="Type"
                onSelect={(value) => setType(value as DebtType)}
                options={typeOptions}
                placeholder="Choose a type"
                sheetTitle="Choose a debt type"
                value={type}
              />
              <FormField
                editable={!saving}
                error={errors.balance}
                keyboardType="decimal-pad"
                label="Remaining balance"
                maxLength={18}
                onChangeText={(value) => {
                  setBalance(value);
                  setErrors((current) => ({ ...current, balance: undefined }));
                  setMessage(null);
                }}
                placeholder="0.00"
                trailing={
                  <Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>
                }
                value={balance}
              />
              <FormField
                editable={!saving}
                error={errors.apr}
                keyboardType="decimal-pad"
                label="Annual interest rate"
                maxLength={8}
                onChangeText={(value) => {
                  setApr(value);
                  setErrors((current) => ({ ...current, apr: undefined }));
                  setMessage(null);
                }}
                placeholder="0"
                trailing={
                  <Text style={[typography.label, { color: theme.colors.textMuted }]}>%</Text>
                }
                value={apr}
              />
              <FormField
                editable={!saving}
                error={errors.minimumPayment}
                keyboardType="decimal-pad"
                label="Minimum monthly payment"
                maxLength={18}
                onChangeText={(value) => {
                  setMinimumPayment(value);
                  setErrors((current) => ({ ...current, minimumPayment: undefined }));
                  setMessage(null);
                }}
                placeholder="0.00"
                trailing={
                  <Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>
                }
                value={minimumPayment}
              />
              <FormField
                editable={!saving}
                error={errors.balanceAsOf}
                label="Balance as of"
                onChangeText={(value) => {
                  setBalanceAsOf(value);
                  setErrors((current) => ({ ...current, balanceAsOf: undefined }));
                  setMessage(null);
                }}
                placeholder="YYYY-MM-DD"
                value={balanceAsOf}
              />
              <SelectionField
                disabled={saving}
                label="Status"
                onSelect={(value) => setStatus(value as DebtStatus)}
                options={statusOptions}
                placeholder="Choose a status"
                sheetTitle="Choose a status"
                value={status}
              />
              {blocked ? (
                <Text
                  accessibilityRole="alert"
                  style={[typography.callout, { color: theme.colors.warning }]}
                >
                  Resolve this debt&apos;s synchronization state before editing it.
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
                accessibilityLabel={editing ? "Save debt changes" : "Save new debt"}
                disabled={blocked}
                loading={saving}
                onPress={() => void save()}
              >
                {editing ? "Save changes" : "Save debt"}
              </Button>
              {editing ? (
                <Button
                  accessibilityLabel="Delete this debt"
                  disabled={blocked || saving}
                  onPress={() => setConfirmDelete(true)}
                  variant="quiet"
                >
                  Delete debt
                </Button>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmationDialog
        confirmLabel="Delete debt"
        destructive
        message="This debt will be removed from your Zoption workspace."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this debt?"
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
