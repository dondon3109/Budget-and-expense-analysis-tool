import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { scanReceipt } from "@/api/receipt-scan";
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

export default function ReceiptScanScreen() {
  const session = useSessionSnapshot();
  const local = useLocalWorkspace();
  const formData = useTransactionFormData();
  const sync = useSyncState();
  const theme = useZoptionTheme();
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localCalendarDate());

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
        base64: true,
        quality: 0.75,
      });
      const asset = result.canceled ? null : (result.assets[0] ?? null);
      if (!asset?.base64) {
        setMessage("No photo was taken.");
        return;
      }
      const extension = asset.fileName?.split(".").pop()?.toLowerCase() ?? asset.mimeType?.split("/")[1] ?? "";
      const mimeType = MIME_BY_EXTENSION[extension] ?? "image/jpeg";
      const accessToken = await session.getAccessToken(false);
      const scannedReceipt = await scanReceipt(
        { accessToken },
        { imageBase64: asset.base64, mimeType },
      );
      setMerchant(scannedReceipt.merchant ?? "");
      setAmount(
        scannedReceipt.amountMinor != null ? formatMinorForInput(scannedReceipt.amountMinor) : "",
      );
      setDate(scannedReceipt.date ?? localCalendarDate());
      setScanned(true);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "The receipt could not be scanned. Try again.",
      );
    } finally {
      setScanning(false);
    }
  };

  const confirm = async (): Promise<void> => {
    const account = formData.data?.accounts.find((candidate) => !candidate.pending);
    const category = formData.data?.categories.find(
      (candidate) => candidate.kind === "expense" && !candidate.pending,
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
      kind: "expense",
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
      setMessage(error instanceof Error ? error.message : "The receipt transaction could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Scan receipt" description="Take a photo and Zoption reads the merchant, date and total.">
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

      {scanned ? (
        <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
          The scanned values are suggestions - check and correct them before saving.
        </Text>
      ) : null}

      {message ? (
        <ErrorState title="Could not scan the receipt" message={message} />
      ) : null}

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
      </View>

      <Button
        accessibilityLabel="Save scanned receipt"
        disabled={!scanned || saving}
        loading={saving}
        onPress={() => void confirm()}
      >
        Save expense
      </Button>
    </Screen>
  );
}
