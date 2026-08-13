import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  accountInputSchema,
  categoryInputSchema,
  type AccountType,
  type TransactionKind,
} from "@zoption/shared";

import { useLocalReferenceData, useLocalWorkspace } from "@/db/local-workspace-state";
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
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

const accountOptions: Array<{ id: AccountType; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "credit", label: "Credit" },
  { id: "other", label: "Other" },
];

const categoryOptions: Array<{ id: TransactionKind; label: string }> = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function ReferenceEditorScreen() {
  const params = useLocalSearchParams<{
    entityType?: string | string[];
    id?: string | string[];
  }>();
  const entityType = single(params.entityType);
  const id = single(params.id);
  const editing = Boolean(id);
  const local = useLocalWorkspace();
  const references = useLocalReferenceData();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const initialized = useRef(false);
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("cash");
  const [categoryKind, setCategoryKind] = useState<TransactionKind>("expense");
  const [color, setColor] = useState("#0F766E");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const account =
    entityType === "account" && id
      ? references.data?.accounts.find((item) => item.id === id)
      : undefined;
  const category =
    entityType === "category" && id
      ? references.data?.categories.find((item) => item.id === id)
      : undefined;

  useEffect(() => {
    if (initialized.current || !references.data) return;
    if (id && !account && !category) return;
    setName(account?.name ?? category?.name ?? "");
    setAccountType(account?.type ?? "cash");
    setCategoryKind(category?.kind ?? "expense");
    setColor(category?.color ?? "#0F766E");
    initialized.current = true;
  }, [account, category, id, references.data]);

  const title = editing
    ? entityType === "account"
      ? "Edit account"
      : "Edit category"
    : entityType === "account"
      ? "New account"
      : "New category";
  const unavailable =
    entityType !== "account" && entityType !== "category"
      ? "This setup route is invalid."
      : id && references.data && !account && !category
        ? "This item is no longer active on this device."
        : null;
  const blocked =
    account?.syncState === "failed" ||
    account?.syncState === "conflicted" ||
    category?.syncState === "failed" ||
    category?.syncState === "conflicted";
  const permanent = Boolean(account?.system || category?.system);

  const save = async (): Promise<void> => {
    if (!local.workspace || saving || blocked || unavailable) return;
    setMessage(null);
    setSaving(true);
    try {
      if (entityType === "account") {
        const parsed = accountInputSchema.safeParse({ name, type: accountType });
        if (!parsed.success) {
          setMessage("Enter an account name and choose its type.");
          return;
        }
        if (id) await local.workspace.transactionMutations.updateAccount(id, parsed.data);
        else await local.workspace.transactionMutations.createAccount(parsed.data);
      } else if (entityType === "category") {
        const parsed = categoryInputSchema.safeParse({ name, kind: categoryKind, color });
        if (!parsed.success) {
          setMessage("Enter a category name and a six-digit color such as #0F766E.");
          return;
        }
        if (id) {
          await local.workspace.transactionMutations.updateCategory(id, {
            name: parsed.data.name,
            color: parsed.data.color,
          });
        } else {
          await local.workspace.transactionMutations.createCategory(parsed.data);
        }
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The change could not be saved to encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async (): Promise<void> => {
    if (!id || !local.workspace || saving || permanent || blocked) return;
    setConfirmArchive(false);
    setSaving(true);
    setMessage(null);
    try {
      if (entityType === "account") await local.workspace.transactionMutations.archiveAccount(id);
      else if (entityType === "category") {
        await local.workspace.transactionMutations.archiveCategory(id);
      }
      router.back();
      sync.retry();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The item could not be archived in encrypted local storage.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (references.error || unavailable) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title }} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            title="Setup item unavailable"
            message={unavailable ?? references.error ?? "The item could not be read."}
            onRetry={unavailable ? undefined : references.retry}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!references.data || (id && !initialized.current)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <Stack.Screen options={{ title }} />
        <View className="gap-3 px-4 pt-6">
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {editing
              ? "The encrypted local copy changes before synchronization begins."
              : "You can save while offline. Server rules are checked when synchronization resumes."}
          </Text>
          {blocked ? (
            <Card style={{ backgroundColor: theme.colors.dangerSoft }}>
              <Text
                accessibilityRole="alert"
                style={[typography.headline, { color: theme.colors.text }]}
              >
                Synchronization needs review
              </Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Zoption preserved this item, but editing is disabled until account/category recovery
                is available.
              </Text>
            </Card>
          ) : null}
          {permanent ? (
            <Card style={{ backgroundColor: theme.colors.brandSoft }}>
              <Text style={[typography.callout, { color: theme.colors.text }]}>
                This permanent item supports existing records and cannot be archived.
              </Text>
            </Card>
          ) : null}
          <View className="gap-4">
            <FormField
              label={entityType === "account" ? "Account name" : "Category name"}
              value={name}
              autoCapitalize="words"
              editable={!saving && !blocked && !(account?.system ?? false)}
              maxLength={80}
              returnKeyType="done"
              onChangeText={(value) => {
                setName(value);
                setMessage(null);
              }}
              onSubmitEditing={() => void save()}
            />
            {entityType === "account" ? (
              <SelectionField
                label="Account type"
                value={accountType}
                options={accountOptions}
                placeholder="Choose a type"
                sheetTitle="Account type"
                disabled={saving || blocked}
                onSelect={(value) => {
                  setAccountType(value as AccountType);
                  setMessage(null);
                }}
              />
            ) : (
              <>
                <SelectionField
                  label="Category type"
                  value={categoryKind}
                  options={categoryOptions}
                  placeholder="Choose a type"
                  sheetTitle="Category type"
                  hint={editing ? "Category type cannot change after creation." : undefined}
                  disabled={editing || saving || blocked}
                  onSelect={(value) => {
                    setCategoryKind(value as TransactionKind);
                    setMessage(null);
                  }}
                />
                <FormField
                  label="Color"
                  value={color}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!saving && !blocked}
                  hint="Six-digit hex color, for example #0F766E"
                  maxLength={7}
                  onChangeText={(value) => {
                    setColor(value.toUpperCase());
                    setMessage(null);
                  }}
                />
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
            <Button disabled={blocked} loading={saving} onPress={() => void save()}>
              {editing ? "Save changes" : `Add ${entityType}`}
            </Button>
            {editing && !permanent ? (
              <Button
                disabled={blocked || saving}
                variant="danger"
                onPress={() => setConfirmArchive(true)}
              >
                Archive {entityType}
              </Button>
            ) : null}
          </View>
          <ConfirmationDialog
            visible={confirmArchive}
            title={`Archive this ${entityType}?`}
            message={`It will stop appearing in new transaction choices. Existing records keep their ${entityType} reference.`}
            confirmLabel="Archive"
            destructive
            onCancel={() => setConfirmArchive(false)}
            onConfirm={() => void archive()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
});
