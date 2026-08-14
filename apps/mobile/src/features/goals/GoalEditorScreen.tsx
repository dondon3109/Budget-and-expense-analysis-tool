import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { FinancialGoalStatus } from "@zoption/shared";

import { useGoal, useLocalWorkspace } from "@/db/local-workspace-state";
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
  defaultTargetDate,
  formatMinorForInput,
  parseGoalForm,
  type GoalFormErrors,
} from "./goal-form";

const statusOptions: Array<{ id: FinancialGoalStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
];

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function GoalEditorScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = single(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const goalState = useGoal(id);
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const initialized = useRef(false);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");
  const [targetDate, setTargetDate] = useState(() => defaultTargetDate());
  const [status, setStatus] = useState<FinancialGoalStatus>("active");
  const [errors, setErrors] = useState<GoalFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    if (editing && !goalState.goal) return;
    if (goalState.goal) {
      setName(goalState.goal.name);
      setTargetAmount(formatMinorForInput(goalState.goal.targetAmountMinor));
      setCurrentAmount(formatMinorForInput(goalState.goal.currentAmountMinor));
      setTargetDate(goalState.goal.targetDate);
      setStatus(goalState.goal.status);
    }
    initialized.current = true;
  }, [editing, goalState.goal]);

  const blocked =
    editing &&
    (goalState.goal?.syncState === "failed" || goalState.goal?.syncState === "conflicted");

  const save = async (): Promise<void> => {
    if (!local.workspace || saving) return;
    const parsed = parseGoalForm({ name, targetAmount, currentAmount, targetDate, status });
    if (!parsed.success) {
      setErrors(parsed.errors);
      setMessage("Check the highlighted details.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing && id) {
        await local.workspace.transactionMutations.updateGoal(id, parsed.input);
      } else {
        await local.workspace.transactionMutations.createGoal(parsed.input);
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The goal could not be saved to encrypted local storage.",
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
      await local.workspace.transactionMutations.deleteGoal(id);
      setConfirmDelete(false);
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The goal could not be removed from encrypted local storage.",
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
      <Stack.Screen options={{ title: editing ? "Edit goal" : "New goal" }} />
      {goalState.error ? (
        <View style={styles.centered}>
          <ErrorState title="Goal unavailable" message={goalState.error} onRetry={goalState.retry} />
        </View>
      ) : editing && goalState.loading ? (
        <View accessibilityLabel="Loading goal" style={styles.centered}>
          <Skeleton height={120} />
        </View>
      ) : editing && !goalState.goal ? (
        <View style={styles.centered}>
          <ErrorState title="Goal not found" message="This goal is no longer active on this device." />
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
                label="Goal name"
                maxLength={80}
                onChangeText={(value) => {
                  setName(value);
                  setErrors((current) => ({ ...current, name: undefined }));
                  setMessage(null);
                }}
                placeholder="Emergency fund"
                value={name}
              />
              <FormField
                editable={!saving}
                error={errors.targetAmount}
                keyboardType="decimal-pad"
                label="Target amount"
                maxLength={18}
                onChangeText={(value) => {
                  setTargetAmount(value);
                  setErrors((current) => ({ ...current, targetAmount: undefined }));
                  setMessage(null);
                }}
                placeholder="0.00"
                trailing={
                  <Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>
                }
                value={targetAmount}
              />
              <FormField
                editable={!saving}
                error={errors.currentAmount}
                keyboardType="decimal-pad"
                label="Saved so far"
                maxLength={18}
                onChangeText={(value) => {
                  setCurrentAmount(value);
                  setErrors((current) => ({ ...current, currentAmount: undefined }));
                  setMessage(null);
                }}
                placeholder="0.00"
                trailing={
                  <Text style={[typography.label, { color: theme.colors.textMuted }]}>PHP</Text>
                }
                value={currentAmount}
              />
              <FormField
                editable={!saving}
                error={errors.targetDate}
                label="Target date"
                onChangeText={(value) => {
                  setTargetDate(value);
                  setErrors((current) => ({ ...current, targetDate: undefined }));
                  setMessage(null);
                }}
                placeholder="YYYY-MM-DD"
                value={targetDate}
              />
              <SelectionField
                disabled={saving}
                label="Status"
                onSelect={(value) => setStatus(value as FinancialGoalStatus)}
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
                  Resolve this goal&apos;s synchronization state before editing it.
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
                accessibilityLabel={editing ? "Save goal changes" : "Save new goal"}
                disabled={blocked}
                loading={saving}
                onPress={() => void save()}
              >
                {editing ? "Save changes" : "Save goal"}
              </Button>
              {editing ? (
                <Button
                  accessibilityLabel="Delete this goal"
                  disabled={blocked || saving}
                  onPress={() => setConfirmDelete(true)}
                  variant="quiet"
                >
                  Delete goal
                </Button>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
      <ConfirmationDialog
        confirmLabel="Delete goal"
        destructive
        message="This goal and its progress will be removed from your Zoption workspace."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this goal?"
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
