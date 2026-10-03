import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  defaultTransactionCategory,
  isCurrency,
  matchCategory,
  parseAmountToMinor,
  preferredTransactionAccount,
  resolveCategoryEmoji,
  sortCategoriesForPicker,
} from "@zoption/shared";

import {
  useDebts,
  useLocalWorkspace,
  useTransactionFormData,
  useTransactionPhoto,
} from "@/db/local-workspace-state";
import { playSound } from "@/features/sounds/sound-effects";
import { useDefaultSpendingAccountStore } from "@/stores/default-spending-account-store";
import { useSyncState } from "@/sync/sync-state";
import { telemetry } from "@/telemetry/telemetry";
import {
  Button,
  Card,
  ConfirmationDialog,
  ErrorState,
  FormField,
  formatDateInput,
  SelectionField,
  Skeleton,
  SyncStatus,
} from "@/ui/components";
import { spacing, typography } from "@/ui/tokens";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useZoptionTheme } from "@/ui/theme-provider";
import {
  debtPaymentApplies,
  fallbackDescription,
  formatMinorForInput,
  localCalendarDate,
  parseTransactionForm,
  type TransactionFormErrors,
  type TransactionFormKind,
  type TransactionFormValues,
} from "./transaction-form";
import {
  VOICE_PREVIEW_AUTO_SAVE_MS,
  VoicePreviewMachine,
  remainingSecondsFromMs,
  type VoicePreviewState,
} from "./voice-preview";
import { DebtPaymentField } from "./DebtPaymentField";
import { KindSelector } from "./KindSelector";
import { NewCategoryInline } from "./NewCategoryInline";
import { VoicePreviewCard, type VoicePreviewDraftSummary } from "./VoicePreviewCard";
import { TransactionVoiceEntry } from "./TransactionVoiceEntry";

const emptyForm: TransactionFormValues = {
  kind: "expense",
  accountId: "",
  toAccountId: "",
  categoryId: "",
  date: localCalendarDate(),
  description: "",
  amount: "",
  transferFee: "",
  currency: "PHP",
  notes: "",
  debtId: "",
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A picture chosen on this screen; null removes the stored one, undefined leaves it alone. */
type PhotoDraft = { mimeType: string; base64: string } | null | undefined;

/** Selection id for the "New category" row; never a real category id. */
const NEW_CATEGORY_OPTION = "__new_category__";

export function TransactionEditorScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    amount?: string | string[];
    description?: string | string[];
    date?: string | string[];
    kind?: string | string[];
    category?: string | string[];
    referenceNumber?: string | string[];
    channel?: string | string[];
    accountSuffix?: string | string[];
    currency?: string | string[];
  }>();
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
  const [voicePreviewState, setVoicePreviewState] = useState<VoicePreviewState>({ status: "idle" });
  const [previewSummary, setPreviewSummary] = useState<VoicePreviewDraftSummary | null>(null);
  const pendingValuesToSaveRef = useRef<TransactionFormValues | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [creatingCategory, setCreatingCategory] = useState(false);
  const storedPhoto = useTransactionPhoto(id);
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft>(undefined);
  const saveRef = useRef<
    ((formValuesToSave?: TransactionFormValues) => Promise<boolean>) | undefined
  >(undefined);

  useEffect(() => {
    if (!formData.data) return;
    const paramAmount = singleParam(params.amount);
    const paramDescription = singleParam(params.description);
    const paramDate = singleParam(params.date);
    const paramKind = singleParam(params.kind);
    const paramCategory = singleParam(params.category);
    const paramRef = singleParam(params.referenceNumber);
    const paramChannel = singleParam(params.channel);
    const paramAccountSuffix = singleParam(params.accountSuffix);
    const paramCurrency = singleParam(params.currency);

    const key =
      id ??
      `new:${paramAmount ?? ""}:${paramDescription ?? ""}:${paramRef ?? ""}:${paramDate ?? ""}`;
    if (initializedFor.current === key) return;
    if (id && !formData.data.transaction) return;
    const existing = formData.data.transaction?.input;
    const existingAccountId =
      existing?.kind === "transfer" ? existing.fromAccountId : existing?.accountId;

    const kind: TransactionFormKind = existing
      ? existing.kind
      : paramKind === "income" || paramKind === "transfer"
        ? paramKind
        : "expense";

    const cleanSuffix = paramAccountSuffix ? paramAccountSuffix.replaceAll("*", "").trim() : "";
    const matchedParamAccount =
      !existing && (cleanSuffix || paramChannel)
        ? formData.data.accounts.find((a) => {
            const nameLower = a.name.toLowerCase();
            if (cleanSuffix && nameLower.includes(cleanSuffix.toLowerCase())) return true;
            if (paramChannel && nameLower.includes(paramChannel.toLowerCase())) return true;
            return false;
          })
        : undefined;

    const account = existing
      ? formData.data.accounts.find((item) => item.id === existingAccountId)
      : (matchedParamAccount ??
        preferredTransactionAccount(
          formData.data.accounts,
          useDefaultSpendingAccountStore.getState().accountId,
        ));

    const matchedCategory =
      !existing && (paramCategory || paramDescription)
        ? matchCategory(formData.data.categories, paramCategory, {
            kind,
            contextText: paramDescription,
          })
        : undefined;

    const category = existing
      ? formData.data.categories.find((item) => item.id === existing.categoryId)
      : (matchedCategory ?? defaultTransactionCategory(formData.data.categories, kind));

    const initialDate = existing?.date ?? paramDate ?? localCalendarDate();
    const initialDesc = existing?.description ?? paramDescription ?? "";
    const initialAmount = existing
      ? formatMinorForInput(existing.amountMinor)
      : (paramAmount ?? "");
    const initialCurrency =
      existing?.currency ??
      (isCurrency(paramCurrency)
        ? paramCurrency
        : (account?.currency ?? useWorkspaceCurrencyStore.getState().currency));
    const initialNotes = existing ? (existing.notes ?? "") : paramRef ? `Ref: ${paramRef}` : "";

    setValues({
      kind,
      accountId: account?.id ?? existingAccountId ?? "",
      toAccountId: existing?.kind === "transfer" ? existing.toAccountId : "",
      categoryId: category?.id ?? existing?.categoryId ?? "",
      date: initialDate,
      description: initialDesc,
      amount: initialAmount,
      transferFee:
        existing?.kind === "transfer" ? formatMinorForInput(existing.transferFeeMinor ?? 0) : "",
      currency: initialCurrency,
      notes: initialNotes,
      debtId: existing && existing.kind !== "income" ? (existing.debtId ?? "") : "",
    });
    initializedFor.current = key;
  }, [
    formData.data,
    id,
    params.amount,
    params.category,
    params.channel,
    params.currency,
    params.date,
    params.description,
    params.kind,
    params.referenceNumber,
    params.accountSuffix,
  ]);

  const blockedState = formData.data?.transaction?.syncState;
  const mutationBlocked = blockedState === "failed" || blockedState === "conflicted";
  const categories = useMemo(
    () =>
      formData.data?.categories.filter(
        (category) =>
          category.kind === values.kind && (values.kind !== "transfer" || !category.pending),
      ) ?? [],
    [formData.data?.categories, values.kind],
  );
  const accountOptions =
    formData.data?.accounts
      .filter((account) => values.kind !== "transfer" || !account.pending)
      .map((account) => ({
        id: account.id,
        label: account.name,
        detail: account.pending ? `${account.currency} · Pending setup` : account.currency,
      })) ?? [];
  const categoryOptions = sortCategoriesForPicker(categories, resolveCategoryEmoji).map(
    (category) => {
      const emoji = resolveCategoryEmoji(category);
      return {
        id: category.id,
        label: emoji ? `${emoji} ${category.name}` : category.name,
        color: category.color,
        detail: category.pending ? "Pending setup" : undefined,
      };
    },
  );
  // Transfers only list synced categories, so a category created here would not appear for them.
  const canCreateCategory = values.kind !== "transfer";
  const localWorkspace = local.workspace;
  const { debts } = useDebts();
  const accountType = (accountId: string) =>
    formData.data?.accounts.find((account) => account.id === accountId)?.type;
  const paysDebt = debtPaymentApplies(values, accountType(values.toAccountId));
  // As on the web: the Debt payment category names its debt whenever there is one to name.
  const debtRequired = values.kind === "expense" && debts.some((debt) => debt.status === "active");

  const updateValue = <Key extends keyof TransactionFormValues>(
    key: Key,
    value: TransactionFormValues[Key],
  ): void => {
    if (voicePreviewState.status === "pending") {
      machineRef.current?.edit();
    }
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage(null);
  };

  const save = async (formValuesToSave?: TransactionFormValues): Promise<boolean> => {
    if (!local.workspace || saving || mutationBlocked) return false;
    const baseValues = formValuesToSave ?? valuesRef.current;
    // The form has no description field; lists still need one, so an entry without one
    // (new, or a voice/receipt draft that left it empty) falls back to its notes or category.
    const targetValues: TransactionFormValues = {
      ...baseValues,
      // A link the entry can no longer carry (another category or account) is dropped.
      debtId: debtPaymentApplies(baseValues, accountType(baseValues.toAccountId))
        ? baseValues.debtId
        : "",
      description:
        baseValues.description.trim() ||
        fallbackDescription(
          baseValues,
          formData.data?.categories.find((item) => item.id === baseValues.categoryId)?.name,
        ),
    };
    if (
      targetValues.kind === "expense" &&
      !targetValues.debtId &&
      debtRequired &&
      debtPaymentApplies(targetValues, undefined)
    ) {
      setErrors({ debtId: "Choose the debt this pays." });
      playSound("error");
      setMessage("Check the highlighted details.");
      return false;
    }
    const parsed = parseTransactionForm(targetValues);
    if (!parsed.success) {
      setErrors(parsed.errors);
      playSound("error");
      setMessage("Check the highlighted details.");
      return false;
    }
    setSaving(true);
    setMessage(null);
    try {
      let savedId = id;
      if (id && parsed.input.kind === "transfer") {
        await local.workspace.transactionMutations.updateTransfer(id, parsed.input);
      } else if (id) {
        await local.workspace.transactionMutations.updateTransaction(id, {
          ...parsed.input,
          notes: parsed.input.notes ?? "",
        });
      } else {
        savedId = await local.workspace.transactionMutations.createTransaction(parsed.input);
      }
      if (savedId && photoDraft !== undefined && parsed.input.kind !== "transfer") {
        await local.workspace.transactionMutations.setTransactionPhoto(savedId, photoDraft);
      }
      void telemetry.capture(id ? "transaction_updated" : "transaction_created", {
        transaction_kind: parsed.input.kind,
      });
      playSound("success");
      router.back();
      sync.retry();
      return true;
    } catch (error) {
      playSound("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The transaction could not be saved to encrypted local storage.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = save;

  const machineRef = useRef<VoicePreviewMachine | null>(null);
  if (!machineRef.current) {
    machineRef.current = new VoicePreviewMachine({
      autoSaveDurationMs: VOICE_PREVIEW_AUTO_SAVE_MS,
      onStateChange: (nextState) => {
        setVoicePreviewState(nextState);
      },
      onAutoSave: async () => {
        const valuesToSave = pendingValuesToSaveRef.current ?? valuesRef.current;
        const saveFn = saveRef.current;
        const savedOk = saveFn ? await saveFn(valuesToSave) : false;
        if (!savedOk) {
          throw new Error("Could not save transaction. Check the highlighted details.");
        }
      },
    });
  }

  useEffect(() => {
    if (voicePreviewState.status !== "pending") return;
    const timer = setInterval(() => {
      machineRef.current?.tick(250);
    }, 250);
    return () => clearInterval(timer);
  }, [voicePreviewState.status]);

  useEffect(() => {
    return () => {
      machineRef.current?.reset();
    };
  }, []);

  const handleEditVoicePreview = () => {
    machineRef.current?.edit();
    pendingValuesToSaveRef.current = null;
  };

  const handleCancelVoicePreview = () => {
    machineRef.current?.cancel();
    pendingValuesToSaveRef.current = null;
    setPreviewSummary(null);
    const synchronizedAccounts =
      formData.data?.accounts.filter((account) => !account.pending) ?? [];
    const defaultAccount = preferredTransactionAccount(
      synchronizedAccounts,
      useDefaultSpendingAccountStore.getState().accountId,
    );
    const defaultCategory = defaultTransactionCategory(
      formData.data?.categories.filter((item) => !item.pending) ?? [],
      "expense",
    );
    setValues({
      kind: "expense",
      accountId: defaultAccount?.id ?? "",
      toAccountId: "",
      categoryId: defaultCategory?.id ?? "",
      date: localCalendarDate(),
      description: "",
      amount: "",
      transferFee: "",
      currency: defaultAccount?.currency ?? useWorkspaceCurrencyStore.getState().currency,
      notes: "",
      debtId: "",
    });
    setErrors({});
    setMessage(null);
  };

  const remove = async (): Promise<void> => {
    if (!id || !local.workspace || saving || mutationBlocked) return;
    setConfirmDelete(false);
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.deleteTransaction(id);
      void telemetry.capture("transaction_deleted", {
        transaction_kind: transfer ? "transfer" : "transaction",
      });
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

  const addPhoto = async (source: "camera" | "library"): Promise<void> => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.4,
      base64: true,
    };
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage("Allow camera access in Settings to take a picture.");
        return;
      }
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.base64) return;
    setPhotoDraft({ mimeType: asset.mimeType ?? "image/jpeg", base64: asset.base64 });
    setMessage(null);
  };
  const photoUri =
    photoDraft === undefined
      ? storedPhoto.photo
      : photoDraft && `data:${photoDraft.mimeType};base64,${photoDraft.base64}`;

  const transfer = values.kind === "transfer";
  const netReceived = useMemo(() => {
    if (!transfer || !values.amount.trim()) return null;
    try {
      const amount = parseAmountToMinor(values.amount);
      const fee = values.transferFee.trim() ? parseAmountToMinor(values.transferFee) : 0;
      return fee < amount ? formatMinorForInput(amount - fee) : null;
    } catch {
      return null;
    }
  }, [transfer, values.amount, values.transferFee]);
  const title = editing
    ? transfer
      ? "Edit transfer"
      : "Edit transaction"
    : transfer
      ? "New transfer"
      : "New transaction";
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

  const hasChoices = accountOptions.length >= (transfer ? 2 : 1) && categoryOptions.length > 0;
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
            <SyncStatus state="pending" />
          ) : null}

          {!hasChoices ? (
            <Card>
              <Text style={[typography.headline, { color: theme.colors.text }]}>
                Account setup needed
              </Text>
              <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                Add at least one active account and an available {values.kind} category before
                saving.
              </Text>
            </Card>
          ) : null}

          {!editing ? (
            <TransactionVoiceEntry
              disabled={!hasChoices || saving || mutationBlocked}
              categories={formData.data?.categories
                .filter((category) => !category.pending)
                .map((category) => category.name)}
              onDraft={(draft) => {
                const nextKind = draft.kind;
                const nextKindCategories =
                  formData.data?.categories.filter(
                    (category) => category.kind === nextKind && !category.pending,
                  ) ?? [];
                const matchingCategory = matchCategory(nextKindCategories, draft.categoryName, {
                  kind: nextKind,
                  contextText: draft.transcript,
                });
                const fallbackCategory = defaultTransactionCategory(nextKindCategories, nextKind);
                const activeAccounts =
                  formData.data?.accounts.filter((account) => !account.pending) ?? [];
                const fromAccount =
                  activeAccounts.find((account) => account.id === values.accountId) ??
                  activeAccounts[0];
                const nextValues: TransactionFormValues = {
                  ...values,
                  kind: nextKind,
                  accountId: fromAccount?.id ?? values.accountId,
                  toAccountId:
                    nextKind === "transfer"
                      ? (activeAccounts.find((account) => account.id !== fromAccount?.id)?.id ?? "")
                      : "",
                  categoryId: matchingCategory?.id ?? fallbackCategory?.id ?? values.categoryId,
                  date: draft.date,
                  description: draft.description,
                  amount: formatMinorForInput(draft.amountMinor),
                  transferFee: "",
                  currency: draft.currency,
                  notes: values.notes,
                };
                setValues(nextValues);
                setErrors({});
                setMessage(null);

                pendingValuesToSaveRef.current = nextValues;
                setPreviewSummary({
                  amountMinor: draft.amountMinor,
                  currency: draft.currency,
                  description: draft.description,
                  categoryName:
                    matchingCategory?.name ?? fallbackCategory?.name ?? draft.categoryName,
                  accountName: fromAccount?.name,
                  kind: nextKind,
                });
                machineRef.current?.start(draft, VOICE_PREVIEW_AUTO_SAVE_MS);
              }}
            />
          ) : null}

          {previewSummary &&
          (voicePreviewState.status === "pending" ||
            voicePreviewState.status === "saving" ||
            voicePreviewState.status === "error") ? (
            <VoicePreviewCard
              draft={previewSummary}
              remainingSeconds={
                voicePreviewState.status === "pending"
                  ? remainingSecondsFromMs(voicePreviewState.remainingMs)
                  : 0
              }
              saving={voicePreviewState.status === "saving" || saving}
              error={voicePreviewState.status === "error" ? voicePreviewState.error : null}
              onEdit={handleEditVoicePreview}
              onCancel={handleCancelVoicePreview}
            />
          ) : null}

          <KindSelector
            value={values.kind}
            disabled={saving || mutationBlocked || editing}
            onChange={(kind) => {
              if (voicePreviewState.status === "pending") {
                machineRef.current?.edit();
              }
              const firstCategory = defaultTransactionCategory(
                formData.data?.categories.filter(
                  (category) => kind !== "transfer" || !category.pending,
                ) ?? [],
                kind,
              );
              setValues((current) => {
                const synchronizedAccounts =
                  formData.data?.accounts.filter((account) => !account.pending) ?? [];
                const fromAccount =
                  kind === "transfer"
                    ? (synchronizedAccounts.find((account) => account.id === current.accountId) ??
                      synchronizedAccounts[0])
                    : formData.data?.accounts.find((account) => account.id === current.accountId);
                return {
                  ...current,
                  kind,
                  accountId: fromAccount?.id ?? current.accountId,
                  toAccountId:
                    kind === "transfer"
                      ? (synchronizedAccounts.find((account) => account.id !== fromAccount?.id)
                          ?.id ?? "")
                      : "",
                  categoryId: firstCategory?.id ?? "",
                  currency: fromAccount?.currency ?? current.currency,
                  transferFee: kind === "transfer" ? current.transferFee : "",
                };
              });
              setErrors((current) => ({ ...current, categoryId: undefined }));
              setMessage(null);
            }}
          />
          <FormField
            editable={!saving && !mutationBlocked}
            autoFocus={!editing}
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
          {transfer ? (
            <FormField
              editable={!saving && !mutationBlocked}
              error={errors.transferFee}
              hint={netReceived ? `Receiver gets ${netReceived} ${values.currency}.` : undefined}
              keyboardType="decimal-pad"
              label="Transfer fee (optional)"
              maxLength={18}
              onChangeText={(value) => updateValue("transferFee", value)}
              placeholder="0.00"
              trailing={
                <Text style={[typography.label, { color: theme.colors.textMuted }]}>
                  {values.currency}
                </Text>
              }
              value={values.transferFee}
            />
          ) : null}
          <SelectionField
            disabled={saving || mutationBlocked}
            error={errors.accountId}
            label={transfer ? "From account" : "Account"}
            onSelect={(accountId) => {
              const account = formData.data?.accounts.find((item) => item.id === accountId);
              setValues((current) => ({
                ...current,
                accountId,
                // Picking the account already on the other side swaps the two sides.
                toAccountId:
                  transfer && accountId === current.toAccountId
                    ? current.accountId
                    : current.toAccountId,
                currency: account?.currency ?? current.currency,
              }));
              setErrors((current) => ({
                ...current,
                accountId: undefined,
                toAccountId: undefined,
              }));
              setMessage(null);
            }}
            options={accountOptions}
            placeholder={transfer ? "Choose source account" : "Choose an account"}
            sheetTitle={transfer ? "Choose source account" : "Choose account"}
            value={values.accountId}
          />
          {transfer ? (
            <SelectionField
              disabled={saving || mutationBlocked}
              error={errors.toAccountId}
              label="To account"
              onSelect={(toAccountId) => {
                const swapped = toAccountId === values.accountId;
                const source = swapped
                  ? formData.data?.accounts.find((item) => item.id === values.toAccountId)
                  : undefined;
                setValues((current) => ({
                  ...current,
                  toAccountId,
                  accountId: swapped ? current.toAccountId : current.accountId,
                  currency: source?.currency ?? current.currency,
                }));
                setErrors((current) => ({
                  ...current,
                  accountId: undefined,
                  toAccountId: undefined,
                }));
                setMessage(null);
              }}
              options={accountOptions}
              placeholder="Choose destination account"
              sheetTitle="Choose destination account"
              value={values.toAccountId}
            />
          ) : null}
          <SelectionField
            disabled={saving || mutationBlocked}
            error={errors.categoryId}
            label="Category"
            onSelect={(categoryId) => {
              if (categoryId === NEW_CATEGORY_OPTION) {
                setCreatingCategory(true);
                return;
              }
              updateValue("categoryId", categoryId);
            }}
            options={
              canCreateCategory
                ? [...categoryOptions, { id: NEW_CATEGORY_OPTION, label: "+ New category" }]
                : categoryOptions
            }
            placeholder="Choose a category"
            sheetTitle={`Choose ${values.kind} category`}
            value={values.categoryId}
          />
          {paysDebt ? (
            <DebtPaymentField
              debts={debts}
              disabled={saving || mutationBlocked}
              error={errors.debtId}
              onChange={(debtId) => updateValue("debtId", debtId)}
              required={debtRequired}
              value={values.debtId}
            />
          ) : null}
          {creatingCategory && canCreateCategory && localWorkspace ? (
            <NewCategoryInline
              kind={values.kind}
              categoryCount={categories.length}
              createCategory={(input) => localWorkspace.transactionMutations.createCategory(input)}
              onCreated={(categoryId) => {
                updateValue("categoryId", categoryId);
                setCreatingCategory(false);
                sync.retry();
              }}
              onCancel={() => setCreatingCategory(false)}
            />
          ) : null}
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving && !mutationBlocked}
            error={errors.date}
            hint="Use YYYY-MM-DD."
            keyboardType="numbers-and-punctuation"
            label="Date"
            maxLength={10}
            onChangeText={(value) => updateValue("date", formatDateInput(value))}
            placeholder="YYYY-MM-DD"
            value={values.date}
          />
          <FormField
            autoCapitalize="sentences"
            editable={!saving && !mutationBlocked}
            error={errors.notes}
            label="Notes"
            maxLength={500}
            multiline
            onChangeText={(value) => updateValue("notes", value)}
            placeholder="Add context for yourself"
            style={styles.notes}
            textAlignVertical="top"
            value={values.notes}
          />
          {!transfer ? (
            <View className="w-full gap-2">
              <Text style={[typography.label, { color: theme.colors.text }]}>
                Photo (stays on this device)
              </Text>
              {photoUri ? (
                <Image
                  accessibilityLabel="Transaction photo"
                  resizeMode="contain"
                  source={{ uri: photoUri }}
                  style={styles.photo}
                />
              ) : null}
              <View className="flex-row gap-3">
                <Button
                  disabled={saving || mutationBlocked}
                  onPress={() => void addPhoto("camera")}
                  variant="secondary"
                >
                  Take photo
                </Button>
                <Button
                  disabled={saving || mutationBlocked}
                  onPress={() => void addPhoto("library")}
                  variant="secondary"
                >
                  Choose photo
                </Button>
                {photoUri ? (
                  <Button
                    disabled={saving || mutationBlocked}
                    onPress={() => setPhotoDraft(null)}
                    variant="quiet"
                  >
                    Remove
                  </Button>
                ) : null}
              </View>
            </View>
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
            accessibilityLabel={
              editing
                ? transfer
                  ? "Save transfer changes"
                  : "Save transaction changes"
                : transfer
                  ? "Save new transfer"
                  : "Save new transaction"
            }
            disabled={!hasChoices || mutationBlocked}
            loading={saving}
            onPress={() => {
              if (voicePreviewState.status === "pending") {
                machineRef.current?.edit();
              }
              void save();
            }}
          >
            {editing ? "Save changes" : transfer ? "Save transfer" : "Save transaction"}
          </Button>
          {editing ? (
            <Button
              accessibilityLabel={transfer ? "Delete transfer" : "Delete transaction"}
              disabled={mutationBlocked}
              onPress={() => setConfirmDelete(true)}
              variant="quiet"
            >
              Delete {transfer ? "transfer" : "transaction"}
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmationDialog
        confirmLabel="Delete"
        destructive
        message={`This removes the ${transfer ? "transfer and both ledger entries" : "transaction"} from this device. If it was already synchronized, Zoption queues the deletion for the server.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title={`Delete ${transfer ? "transfer" : "transaction"}?`}
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
  notes: { minHeight: 104 },
  photo: { width: "100%", height: 220, borderRadius: 12 },
});
