import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { CURRENT_RECEIPT_CONSENT_VERSION, type ReceiptDraft } from "@zoption/shared";

import { ApiTransportError } from "@/api/authenticated";
import {
  extractReceipt,
  getReceiptPreferences,
  grantReceiptConsent,
} from "@/api/receipt-scan";
import { useSessionSnapshot } from "@/auth/session-state";
import { useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import { useSyncState } from "@/sync/sync-state";
import { Button, ErrorState, FormField } from "@/ui/components";
import { Screen } from "@/ui/screen";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";
import {
  formatMinorForInput,
  localCalendarDate,
  parseTransactionForm,
} from "@/features/transactions/transaction-form";

const MIME_BY_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type PrefsPhase = "loading" | "consent" | "ready" | "unavailable" | "error";

const CONSENT_POINTS = [
  {
    icon: "check-circle-outline",
    title: "You approve every field",
    text: "The suggested entry is shown here for review. Nothing is saved until you confirm it.",
  },
  {
    icon: "delete-outline",
    title: "Photos are never stored",
    text: "Your photo is used only to read the fields during this request and is discarded right after.",
  },
  {
    icon: "eye-outline",
    title: "Stays off until you accept",
    text: "Receipt scanning never runs in the background. You can keep entering expenses manually.",
  },
  {
    icon: "shield-check-outline",
    title: "Read-only by design",
    text: "The AI reads your photo to draft an entry and never edits your records on its own.",
  },
] as const;

export default function ReceiptScanScreen() {
  const session = useSessionSnapshot();
  const local = useLocalWorkspace();
  const formData = useTransactionFormData();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const mounted = useRef(true);
  const [phase, setPhase] = useState<PrefsPhase>("loading");
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localCalendarDate());
  const [kind, setKind] = useState<"expense" | "income">("expense");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
      const preferences = await withToken((token) =>
        getReceiptPreferences({ accessToken: token }),
      );
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
      if (!mounted.current) return;
      setPhase("ready");
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

  const takePhoto = async (): Promise<void> => {
    setScanning(true);
    setMessage(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage("Camera access is off. Enable it in system settings to scan receipts.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.75,
      });
      const asset = result.canceled ? null : (result.assets[0] ?? null);
      if (!asset) {
        setMessage("No photo was taken.");
        return;
      }
      const extension =
        asset.fileName?.split(".").pop()?.toLowerCase() ??
        asset.mimeType?.split("/")[1] ??
        "";
      const mimeType = MIME_BY_EXTENSION[extension] ?? "image/jpeg";
      const extracted = await withToken((token) =>
        extractReceipt(
          { accessToken: token },
          { uri: asset.uri, fileName: asset.fileName ?? `receipt.${extension || "jpg"}`, mimeType },
        ),
      );
      if (!mounted.current) return;
      setDraft(extracted);
      setMerchant(extracted.merchant);
      setAmount(formatMinorForInput(extracted.amountMinor));
      setDate(extracted.date);
      setKind(extracted.kind === "income" ? "income" : "expense");
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

  const confirm = async (): Promise<void> => {
    const account = formData.data?.accounts.find((candidate) => !candidate.pending);
    const category =
      formData.data?.categories.find(
        (candidate) => candidate.kind === kind && !candidate.pending,
      ) ?? formData.data?.categories.find((candidate) => !candidate.pending);
    if (!account || !category) {
      setMessage("Add an account and a category first, then confirm the receipt.");
      return;
    }
    if (merchant.trim().length === 0 && amount.trim().length === 0) {
      setMessage("Enter the merchant or the amount before saving.");
      return;
    }
    const parsed = parseTransactionForm({
      kind,
      accountId: account.id,
      toAccountId: "",
      categoryId: category.id,
      date,
      description: merchant.trim(),
      amount,
      transferFee: "",
      currency: "PHP",
      notes: "Scanned receipt",
    });
    if (!parsed.success) {
      setMessage(parsed.errors.amount ?? parsed.errors.date ?? "Check the scanned details.");
      return;
    }
    if (!local.workspace) return;
    setSaving(true);
    setMessage(null);
    try {
      await local.workspace.transactionMutations.createTransaction(parsed.input);
      sync.retry();
      router.back();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The receipt transaction could not be saved.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const cameraAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={scanning ? "Reading receipt" : "Take receipt photo"}
      disabled={scanning}
      onPress={() => void takePhoto()}
      style={({ pressed }) => [
        {
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          paddingVertical: spacing.xl,
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: scanning ? theme.colors.textMuted : theme.colors.brand,
          backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surfaceRaised,
        },
      ]}
    >
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={scanning ? theme.colors.textMuted : theme.colors.brand}
        name={scanning ? "loading" : "camera-outline"}
        size={32}
      />
      <Text style={[typography.body, { color: scanning ? theme.colors.textMuted : theme.colors.text }]}>
        {scanning ? "Reading receipt…" : "Take receipt photo"}
      </Text>
    </Pressable>
  );

  return (
    <Screen title="Scan receipt" description="Take a photo and Zoption reads the merchant, date and total.">
      {phase === "loading" ? (
        <View className="w-full items-center py-10">
          <ActivityIndicator color={theme.colors.brand} />
          <Text style={[typography.caption, { color: theme.colors.textMuted, marginTop: spacing.sm }]}>
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
        <View className="w-full items-start gap-4 py-4">
          <View className="w-full flex-row items-center gap-3">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.brandSoft,
              }}
            >
              <MaterialCommunityIcons name="camera-outline" size={24} color={theme.colors.brand} />
            </View>
            <Text style={[typography.title, { color: theme.colors.text, flexShrink: 1 }]}>
              Snap a receipt. You approve every field.
            </Text>
          </View>
          <Text style={[typography.body, { color: theme.colors.textMuted }]}>
            Zoption sends only the photo you choose to a vision model to read the merchant, amount,
            date and a suggested category. The photo is processed in-flight and discarded immediately
            - it is never stored, kept, or used for anything else. Nothing is added to your budget
            until you confirm it.
          </Text>
          {CONSENT_POINTS.map((point) => (
            <View key={point.title} className="w-full flex-row items-start gap-3">
              <MaterialCommunityIcons
                accessibilityElementsHidden
                name={point.icon}
                size={20}
                color={theme.colors.brand}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[typography.label, { color: theme.colors.text }]}>{point.title}</Text>
                <Text style={[typography.caption, { color: theme.colors.textMuted }]}>{point.text}</Text>
              </View>
            </View>
          ))}
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
            AI extraction can misread text - always check the amount and date before saving.
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
        <View className="w-full gap-4">
          {cameraAction}
          {draft ? (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              The scanned values are suggestions - check and correct them before saving.
            </Text>
          ) : null}
          {message ? (
            <ErrorState title="Could not scan the receipt" message={message} />
          ) : null}
          {draft ? (
            <View className="w-full gap-4">
              <FormField
                label="Merchant"
                value={merchant}
                onChangeText={setMerchant}
                placeholder="e.g. Jollibee"
                maxLength={140}
              />
              <FormField
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <FormField
                label="Date"
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
              />
              <View className="w-full flex-row items-center gap-3">
                <Text style={[typography.body, { color: theme.colors.textMuted }]}>Type</Text>
                {(["expense", "income"] as const).map((option) => {
                  const selected = kind === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityLabel={`Set type to ${option}`}
                      onPress={() => setKind(option)}
                      style={{
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: selected ? theme.colors.brand : theme.colors.border,
                        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                      }}
                    >
                      <Text
                        style={[
                          typography.body,
                          { color: selected ? theme.colors.brand : theme.colors.textMuted },
                        ]}
                      >
                        {option === "expense" ? "Expense" : "Income"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {draft.rawText.trim().length > 0 ? (
                <View
                  style={{
                    borderRadius: 12,
                    padding: spacing.md,
                    backgroundColor: theme.colors.surfaceRaised,
                  }}
                >
                  <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
                    Text read from the photo
                  </Text>
                  <Text
                    numberOfLines={4}
                    style={[typography.caption, { color: theme.colors.text, marginTop: spacing.xs }]}
                  >
                    {draft.rawText}
                  </Text>
                </View>
              ) : null}
              <Button
                accessibilityLabel="Save scanned receipt"
                disabled={saving}
                loading={saving}
                onPress={() => void confirm()}
              >
                Save {kind === "expense" ? "expense" : "income"}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
