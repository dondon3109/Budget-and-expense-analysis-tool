import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  CURRENT_RECEIPT_CONSENT_VERSION,
  preferredTransactionAccount,
  type ReceiptDraft,
  type TransactionInput,
} from "@zoption/shared";

import { ApiTransportError } from "@/api/authenticated";
import { extractReceipt, getReceiptPreferences, grantReceiptConsent } from "@/api/receipt-scan";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import {
  receiptItemDescription,
  reviewedItemsTotalMinor,
  reviewItemsFromReceipt,
  type ReceiptReviewCategory,
  type ReceiptReviewItem,
} from "@/features/receipts/receipt-review";
import {
  formatMinorForInput,
  localCalendarDate,
  parseTransactionForm,
} from "@/features/transactions/transaction-form";
import { useSyncState } from "@/sync/sync-state";
import { Button, Card, ErrorState, FormField, SelectionField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";

const MIME_BY_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type PrefsPhase = "loading" | "consent" | "ready" | "unavailable" | "error";
type ReceiptKind = "expense" | "income";

const CONSENT_POINTS = [
  {
    icon: "format-list-bulleted",
    title: "You review every entry",
    text: "Zoption shows every drafted receipt line, PDF transaction, or spoken entry before anything is saved.",
  },
  {
    icon: "delete-outline",
    title: "Source files are never stored",
    text: "Your photo, PDF, or recording is used only during the request that reads it and is then discarded.",
  },
  {
    icon: "eye-outline",
    title: "Stays off until you accept",
    text: "AI-assisted entry never runs in the background. Manual entry remains available.",
  },
] as const;

function defaultCategoryId(categories: ReceiptReviewCategory[], kind: ReceiptKind): string {
  const usable = categories.filter((category) => category.kind === kind);
  return (
    usable.find((category) => category.name.toLocaleLowerCase("en") === "uncategorized")?.id ??
    usable[0]?.id ??
    ""
  );
}

function peso(amountMinor: number): string {
  return `₱${formatMinorForInput(amountMinor)}`;
}

function ItemKindSelector({
  value,
  disabled,
  onChange,
}: {
  value: ReceiptKind;
  disabled?: boolean;
  onChange: (value: ReceiptKind) => void;
}) {
  const theme = useZoptionTheme();
  return (
    <View className="w-full gap-2">
      <Text style={[typography.label, { color: theme.colors.text }]}>Type</Text>
      <View
        accessibilityRole="radiogroup"
        style={[styles.kindGroup, { backgroundColor: theme.colors.canvasMuted }]}
      >
        {(["expense", "income"] as const).map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
              disabled={disabled}
              onPress={() => onChange(option)}
              style={[
                styles.kindOption,
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
                name={option === "expense" ? "arrow-up-right" : "arrow-down-left"}
                size={19}
              />
              <Text
                style={[
                  typography.label,
                  { color: selected ? theme.colors.text : theme.colors.textMuted },
                ]}
              >
                {option === "expense" ? "Expense" : "Income"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ReceiptScanScreen() {
  const session = useSessionSnapshot();
  const local = useLocalWorkspace();
  const formData = useTransactionFormData();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const mounted = useRef(true);
  const nextItemId = useRef(1);
  const [phase, setPhase] = useState<PrefsPhase>("loading");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(localCalendarDate());
  const [kind, setKind] = useState<ReceiptKind>("expense");
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<ReceiptReviewItem[]>([]);
  const [showRawText, setShowRawText] = useState(false);

  const accounts = useMemo(
    () => formData.data?.accounts.filter((account) => !account.pending) ?? [],
    [formData.data?.accounts],
  );
  const categories = useMemo(
    () => formData.data?.categories.filter((category) => !category.pending) ?? [],
    [formData.data?.categories],
  );
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) => category.kind === kind)
        .map((category) => ({ id: category.id, label: category.name, color: category.color })),
    [categories, kind],
  );
  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: account.name,
        detail: account.currency,
      })),
    [accounts],
  );
  const reviewedTotalMinor = useMemo(() => reviewedItemsTotalMinor(items), [items]);
  const receiptTotalMinor = draft ? Math.abs(draft.amountMinor) : null;
  const hasExtractedLines = Boolean(draft?.items?.length);
  const totalsMatch =
    reviewedTotalMinor !== null &&
    receiptTotalMinor !== null &&
    reviewedTotalMinor === receiptTotalMinor;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const defaultAccount = preferredTransactionAccount(accounts);
    if (!accountId && defaultAccount) setAccountId(defaultAccount.id);
  }, [accountId, accounts]);

  useEffect(() => {
    const fallback = defaultCategoryId(categories, kind);
    if (!fallback) return;
    setItems((current) =>
      current.map((item) =>
        categoryOptions.some((category) => category.id === item.categoryId)
          ? item
          : { ...item, categoryId: fallback },
      ),
    );
  }, [categories, categoryOptions, kind]);

  const withToken = useCallback(
    async <T,>(operation: (accessToken: string) => Promise<T>): Promise<T> => {
      try {
        return await operation(await session.getAccessToken(false));
      } catch (error) {
        if (error instanceof ApiTransportError && error.code === "session_expired") {
          return operation(await session.getAccessToken(true));
        }
        throw error;
      }
    },
    [session],
  );

  const loadPreferences = useCallback(async () => {
    setPhase("loading");
    setMessage(null);
    try {
      const preferences = await withToken((token) => getReceiptPreferences({ accessToken: token }));
      if (!mounted.current) return;
      setPhase(
        preferences.enabled &&
          preferences.consentedAt !== null &&
          preferences.consentVersion === CURRENT_RECEIPT_CONSENT_VERSION
          ? "ready"
          : "consent",
      );
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiTransportError && error.code === "not_found") {
        setPhase("unavailable");
        return;
      }
      setPhase("error");
      setMessage(
        error instanceof ApiTransportError
          ? error.message
          : "Receipt scanning could not be reached. Try again.",
      );
    }
  }, [withToken]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const acceptConsent = async (): Promise<void> => {
    setConsentBusy(true);
    setConsentError(null);
    try {
      await withToken((token) => grantReceiptConsent({ accessToken: token }));
      if (mounted.current) setPhase("ready");
    } catch (error) {
      if (!mounted.current) return;
      setConsentError(
        error instanceof ApiTransportError
          ? error.message
          : "Receipt scanning could not be enabled. Try again.",
      );
    } finally {
      if (mounted.current) setConsentBusy(false);
    }
  };

  const readAsset = async (asset: ImagePicker.ImagePickerAsset): Promise<void> => {
    setScanning(true);
    setMessage(null);
    setDraft(null);
    setItems([]);
    try {
      const extension =
        asset.fileName?.split(".").pop()?.toLowerCase() ?? asset.mimeType?.split("/")[1] ?? "";
      const mimeType = MIME_BY_EXTENSION[extension] ?? "image/jpeg";
      const extracted = await withToken((token) =>
        extractReceipt(
          { accessToken: token },
          {
            uri: asset.uri,
            fileName: asset.fileName ?? `receipt.${extension || "jpg"}`,
            mimeType,
          },
        ),
      );
      if (!mounted.current) return;
      const extractedKind: ReceiptKind = extracted.kind === "income" ? "income" : "expense";
      const reviewItems = reviewItemsFromReceipt(extracted, categories, extractedKind);
      nextItemId.current = reviewItems.length + 1;
      setDraft(extracted);
      setMerchant(extracted.merchant);
      setDate(extracted.date);
      setKind(extractedKind);
      setItems(reviewItems);
      setShowRawText(false);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiTransportError && error.serverCode === "receipt_consent_required") {
        setPhase("consent");
        setMessage("Accept the receipt photo notice first, then scan again.");
        return;
      }
      setMessage(
        error instanceof ApiTransportError
          ? error.message
          : "The receipt could not be scanned. Try again with a clearer photo.",
      );
    } finally {
      if (mounted.current) setScanning(false);
    }
  };

  const takePhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage("Camera access is off. Enable it in system settings to scan receipts.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.75 });
    const asset = result.canceled ? null : (result.assets[0] ?? null);
    if (asset) await readAsset(asset);
  };

  const choosePhoto = async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
    });
    const asset = result.canceled ? null : (result.assets[0] ?? null);
    if (asset) await readAsset(asset);
  };

  const updateItem = (id: string, update: Partial<ReceiptReviewItem>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)));
    setMessage(null);
  };

  const changeKind = (nextKind: ReceiptKind): void => {
    setKind(nextKind);
    const fallback = defaultCategoryId(categories, nextKind);
    setItems((current) => current.map((item) => ({ ...item, categoryId: fallback })));
    setMessage(null);
  };

  const addItem = (): void => {
    const fallback = defaultCategoryId(categories, kind);
    setItems((current) => {
      if (current.length >= 30) return current;
      const id = `manual-${nextItemId.current++}`;
      return [...current, { id, description: "", amount: "", categoryId: fallback }];
    });
  };

  const confirm = async (): Promise<void> => {
    if (!local.workspace) return;
    if (!accountId) {
      setMessage("Choose the account that paid for this receipt before saving.");
      return;
    }
    if (!merchant.trim()) {
      setMessage("Enter the merchant before saving.");
      return;
    }
    if (!items.length) {
      setMessage("Keep at least one receipt item before saving.");
      return;
    }
    if (reviewedTotalMinor === null) {
      setMessage("Enter a valid amount for every receipt item.");
      return;
    }
    if (hasExtractedLines && !totalsMatch) {
      setMessage(
        `The items add to ${peso(reviewedTotalMinor)}, but the receipt total is ${peso(receiptTotalMinor ?? 0)}. Correct the amounts or add the missing fee or discount before saving.`,
      );
      return;
    }

    const inputs: Array<Extract<TransactionInput, { kind: ReceiptKind }>> = [];
    for (const [index, item] of items.entries()) {
      const parsed = parseTransactionForm({
        kind,
        accountId,
        toAccountId: "",
        categoryId: item.categoryId,
        date,
        description: receiptItemDescription(merchant, item.description),
        amount: item.amount,
        transferFee: "",
        currency: "PHP",
        notes: "Scanned receipt",
      });
      if (!parsed.success) {
        setMessage(
          `Item ${index + 1}: ${parsed.errors.description ?? parsed.errors.amount ?? parsed.errors.categoryId ?? "Check the details."}`,
        );
        return;
      }
      if (parsed.input.kind === "transfer") {
        setMessage("Receipt items must be income or expense transactions.");
        return;
      }
      inputs.push(parsed.input);
    }

    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.createTransactions(inputs);
      sync.retry();
      router.back();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The receipt items could not be saved to encrypted local storage.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const captureActions = (
    <Card style={styles.captureCard}>
      <View className="flex-row items-start gap-3">
        <View style={[styles.captureIcon, { backgroundColor: theme.colors.brandSoft }]}>
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={theme.colors.brand}
            name={
              scanning
                ? "receipt-text-outline"
                : draft
                  ? "receipt-text-check-outline"
                  : "camera-outline"
            }
            size={25}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text style={[typography.headline, { color: theme.colors.text }]}>
            {scanning
              ? "Reading every line…"
              : draft
                ? "Receipt ready for review"
                : "Capture a clear receipt"}
          </Text>
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            {scanning
              ? "Finding the merchant, date, total, and each purchased item."
              : draft
                ? "Take another photo if anything is missing or hard to read."
                : "Keep the full receipt flat in frame, including line prices and the final total."}
          </Text>
        </View>
      </View>
      <Button
        accessibilityLabel={draft ? "Scan another receipt photo" : "Take receipt photo"}
        icon="camera-outline"
        loading={scanning}
        onPress={() => void takePhoto()}
        size="large"
      >
        {scanning ? "Reading receipt…" : draft ? "Scan another photo" : "Take receipt photo"}
      </Button>
      <Button
        accessibilityLabel="Choose receipt photo from library"
        disabled={scanning}
        icon="image-outline"
        onPress={() => void choosePhoto()}
        size="large"
        variant="secondary"
      >
        Choose a photo
      </Button>
      {!draft && !scanning ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          JPEG, PNG, or WebP · up to 8 MB · photos are not stored
        </Text>
      ) : null}
    </Card>
  );

  return (
    <Screen title="Scan receipt" showHeading={false}>
      {phase === "loading" ? (
        <View className="w-full items-center py-10">
          <ActivityIndicator color={theme.colors.brand} />
          <Text
            style={[typography.caption, { color: theme.colors.textMuted, marginTop: spacing.sm }]}
          >
            Checking receipt scanning…
          </Text>
        </View>
      ) : null}

      {phase === "unavailable" ? (
        <ErrorState
          title="Receipt scanning is not available"
          message="Receipt scanning is not enabled for this account yet."
          onRetry={() => void loadPreferences()}
        />
      ) : null}

      {phase === "error" ? (
        <ErrorState
          title="Could not load receipt scanning"
          message={message ?? "Receipt scanning could not be reached."}
          onRetry={() => void loadPreferences()}
        />
      ) : null}

      {phase === "consent" ? (
        <View className="w-full gap-5 py-2">
          <View className="gap-2">
            <Text style={[typography.title, { color: theme.colors.text }]}>
              Review first. Save only when it is right.
            </Text>
            <Text style={[typography.body, { color: theme.colors.textMuted }]}>
              Zoption sends only the photo, PDF, or recording you choose to AI during that request.
              It drafts editable entries; you remain in control of every transaction.
            </Text>
          </View>
          <View className="w-full gap-4">
            {CONSENT_POINTS.map((point) => (
              <View key={point.title} className="w-full flex-row items-start gap-3">
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={theme.colors.brand}
                  name={point.icon}
                  size={21}
                  style={{ marginTop: 1 }}
                />
                <View className="min-w-0 flex-1 gap-1">
                  <Text style={[typography.label, { color: theme.colors.text }]}>
                    {point.title}
                  </Text>
                  <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                    {point.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            AI can misread printed text. Check item amounts and the receipt total before saving.
          </Text>
          <Button
            accessibilityLabel="Accept and enable receipt scanning"
            loading={consentBusy}
            onPress={() => void acceptConsent()}
          >
            Accept and enable receipt scanning
          </Button>
          {consentError ? (
            <ErrorState title="Receipt scanning could not be enabled" message={consentError} />
          ) : null}
        </View>
      ) : null}

      {phase === "ready" ? (
        <View className="w-full gap-5">
          {captureActions}
          {message ? (
            <ErrorState
              title={draft ? "Check this receipt" : "Could not scan the receipt"}
              message={message}
            />
          ) : null}

          {draft ? (
            <View className="w-full gap-5">
              <View className="gap-1">
                <Text
                  accessibilityRole="header"
                  style={[typography.title, { color: theme.colors.text }]}
                >
                  Review {items.length} {items.length === 1 ? "item" : "items"}
                </Text>
                <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                  Each item will become its own transaction in your encrypted local workspace.
                </Text>
              </View>

              <View
                accessibilityRole="summary"
                accessibilityLabel={
                  totalsMatch
                    ? `Item total ${peso(reviewedTotalMinor ?? 0)} matches the receipt total.`
                    : `Items need review. Receipt total is ${peso(receiptTotalMinor ?? 0)}.`
                }
                style={[
                  styles.reconciliation,
                  {
                    backgroundColor: totalsMatch
                      ? theme.colors.brandSoft
                      : theme.colors.warningSoft,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={totalsMatch ? theme.colors.brand : theme.colors.warning}
                  name={totalsMatch ? "check-circle-outline" : "alert-circle-outline"}
                  size={24}
                />
                <View className="min-w-0 flex-1 gap-1">
                  <Text style={[typography.headline, { color: theme.colors.text }]}>
                    {reviewedTotalMinor === null
                      ? "Enter every item amount"
                      : totalsMatch
                        ? "Items match the receipt total"
                        : "Items need review before saving"}
                  </Text>
                  <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                    Items: {reviewedTotalMinor === null ? "—" : peso(reviewedTotalMinor)} · Receipt:{" "}
                    {peso(receiptTotalMinor ?? 0)}
                  </Text>
                  {!hasExtractedLines ? (
                    <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                      No itemized lines were read confidently, so this will save as one receipt
                      total.
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className="w-full gap-4">
                <SelectionField
                  label="Paid from"
                  value={accountId}
                  options={accountOptions}
                  placeholder="Choose an account"
                  sheetTitle="Paid from"
                  hint="Select the account that paid for this receipt."
                  onSelect={setAccountId}
                />
                <FormField
                  label="Merchant"
                  value={merchant}
                  onChangeText={(value) => {
                    setMerchant(value);
                    setMessage(null);
                  }}
                  placeholder="e.g. Jollibee"
                  maxLength={140}
                />
                <FormField
                  label="Date"
                  value={date}
                  onChangeText={(value) => {
                    setDate(value);
                    setMessage(null);
                  }}
                  placeholder="YYYY-MM-DD"
                />
                <ItemKindSelector value={kind} disabled={saving} onChange={changeKind} />
              </View>

              <View className="w-full gap-3">
                <View className="flex-row items-end justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text
                      accessibilityRole="header"
                      style={[typography.headline, { color: theme.colors.text }]}
                    >
                      Receipt items
                    </Text>
                    <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                      Correct, remove, or add an item before saving.
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    {items.length}/30
                  </Text>
                </View>
                {items.map((item, index) => (
                  <Card key={item.id} style={styles.itemCard}>
                    <View className="flex-row items-center justify-between gap-3">
                      <Text style={[typography.label, { color: theme.colors.text }]}>
                        Item {index + 1}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove item ${index + 1}`}
                        accessibilityState={{ disabled: items.length === 1 || saving }}
                        disabled={items.length === 1 || saving}
                        onPress={() =>
                          setItems((current) =>
                            current.filter((candidate) => candidate.id !== item.id),
                          )
                        }
                        style={({ pressed }) => [
                          styles.removeItem,
                          {
                            backgroundColor: pressed ? theme.colors.dangerSoft : "transparent",
                            opacity: items.length === 1 || saving ? 0.45 : 1,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          accessibilityElementsHidden
                          color={theme.colors.danger}
                          name="trash-can-outline"
                          size={19}
                        />
                        <Text style={[typography.label, { color: theme.colors.danger }]}>
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                    <FormField
                      label="Description"
                      value={item.description}
                      onChangeText={(value) => updateItem(item.id, { description: value })}
                      placeholder="e.g. Chickenjoy"
                      maxLength={160}
                    />
                    <FormField
                      label="Amount"
                      value={item.amount}
                      onChangeText={(value) => updateItem(item.id, { amount: value })}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                    <SelectionField
                      label="Category"
                      value={item.categoryId}
                      options={categoryOptions}
                      placeholder="Choose a category"
                      sheetTitle={`Category for item ${index + 1}`}
                      onSelect={(categoryId) => updateItem(item.id, { categoryId })}
                    />
                  </Card>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add receipt item"
                  accessibilityState={{ disabled: items.length >= 30 || saving }}
                  disabled={items.length >= 30 || saving}
                  onPress={addItem}
                  style={({ pressed }) => [
                    styles.addItem,
                    {
                      backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
                      borderColor: theme.colors.border,
                      opacity: items.length >= 30 || saving ? 0.45 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    accessibilityElementsHidden
                    color={theme.colors.brand}
                    name="plus"
                    size={21}
                  />
                  <Text style={[typography.label, { color: theme.colors.brand }]}>Add item</Text>
                </Pressable>
              </View>

              {draft.rawText.trim() ? (
                <View className="w-full gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      showRawText
                        ? "Hide text read from the photo"
                        : "Show text read from the photo"
                    }
                    accessibilityState={{ expanded: showRawText }}
                    onPress={() => setShowRawText((current) => !current)}
                    style={({ pressed }) => [
                      styles.rawToggle,
                      { backgroundColor: pressed ? theme.colors.canvasMuted : "transparent" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      accessibilityElementsHidden
                      color={theme.colors.textMuted}
                      name={showRawText ? "chevron-up" : "chevron-down"}
                      size={21}
                    />
                    <Text style={[typography.label, { color: theme.colors.textMuted }]}>
                      Text read from the photo
                    </Text>
                  </Pressable>
                  {showRawText ? (
                    <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
                      {draft.rawText}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <Button
                accessibilityLabel={`Save ${items.length} scanned ${items.length === 1 ? "item" : "items"}`}
                disabled={saving}
                loading={saving}
                onPress={() => void confirm()}
              >
                Save {items.length} {kind === "expense" ? "expense" : "income"}
                {items.length === 1 ? "" : "s"}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  captureCard: { gap: spacing.md },
  captureIcon: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kindGroup: {
    flexDirection: "row",
    borderRadius: radii.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  kindOption: {
    minHeight: touchTarget - spacing.xs,
    borderWidth: 1,
    borderRadius: radii.sm,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  reconciliation: {
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  itemCard: { gap: spacing.md },
  removeItem: {
    minHeight: touchTarget,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xxs,
  },
  addItem: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  rawToggle: {
    minHeight: touchTarget,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
