import { parseSmsNotification, type ParsedSmsTransaction } from "@zoption/shared";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Clipboard, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet, Button, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";

export interface SmsQuickPasteModalProps {
  visible: boolean;
  onDismiss: () => void;
  onApply?: (parsed: ParsedSmsTransaction) => void;
  initialText?: string;
  readClipboard?: () => Promise<string>;
}

const defaultReadClipboard = (): Promise<string> => Clipboard.getString();

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  const theme = useZoptionTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.caption, styles.detailLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
      <View style={styles.detailValue}>{children}</View>
    </View>
  );
}

export function SmsQuickPasteModal({
  visible,
  onDismiss,
  onApply,
  initialText = "",
  readClipboard = defaultReadClipboard,
}: SmsQuickPasteModalProps) {
  const theme = useZoptionTheme();
  const [smsText, setSmsText] = useState(initialText);
  const [parsed, setParsed] = useState<ParsedSmsTransaction | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [clipboardBusy, setClipboardBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSmsText(initialText);
      setParsed(null);
      setParseError(null);
      setClipboardError(null);
    }
  }, [visible, initialText]);

  const pasteFromClipboard = async (): Promise<void> => {
    if (clipboardBusy) return;
    setClipboardBusy(true);
    setClipboardError(null);
    try {
      const pasted = await readClipboard();
      if (!pasted.trim()) {
        setClipboardError("The clipboard is empty. Copy the SMS or notification first.");
        return;
      }
      setSmsText(pasted);
      setParsed(null);
      setParseError(null);
    } catch {
      setClipboardError("Could not read the clipboard on this device. Paste the text manually.");
    } finally {
      setClipboardBusy(false);
    }
  };

  const parse = (): void => {
    if (!smsText.trim()) {
      setParsed(null);
      setParseError("Paste an SMS or bank notification first.");
      return;
    }
    const result = parseSmsNotification(smsText.trim());
    if (!result) {
      setParsed(null);
      setParseError("That text couldn't be recognized as a transaction. Check it and try again.");
      return;
    }
    setParsed(result);
    setParseError(null);
  };

  const apply = (): void => {
    if (!parsed) return;
    if (onApply) onApply(parsed);
    else router.push("/(app)/transaction");
    onDismiss();
  };

  const dateTime = parsed?.time ? `${parsed.date} · ${parsed.time}` : (parsed?.date ?? "");

  return (
    <BottomSheet visible={visible} title="Paste SMS notification" onDismiss={onDismiss}>
      <View style={styles.content}>
        <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
          Paste a bank or wallet SMS to fill in the amount, merchant, and date. Nothing saves until
          you review it in the transaction editor.
        </Text>
        <TextInput
          accessibilityLabel="SMS notification text"
          accessibilityHint="Paste the bank or wallet notification message here"
          editable={!clipboardBusy}
          maxFontSizeMultiplier={1.2}
          multiline
          numberOfLines={4}
          onChangeText={(value) => {
            setSmsText(value);
            setParseError(null);
          }}
          placeholder="e.g. You have paid PHP 250.00 of GCash to JOLLIBEE…"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            },
          ]}
          textAlignVertical="top"
          value={smsText}
        />
        {clipboardError ? (
          <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.danger }]}>
            {clipboardError}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            accessibilityHint="Reads the copied SMS text from the clipboard"
            icon="content-paste"
            loading={clipboardBusy}
            onPress={() => void pasteFromClipboard()}
            variant="secondary"
          >
            Auto-Paste from Clipboard
          </Button>
          <Button
            accessibilityHint="Extracts the transaction details from the pasted text"
            icon="magnify"
            onPress={parse}
            variant="primary"
          >
            Parse details
          </Button>
        </View>
        {parseError ? (
          <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.danger }]}>
            {parseError}
          </Text>
        ) : null}
        {parsed ? (
          <View
            accessibilityLabel="Parsed transaction details"
            style={[
              styles.details,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <DetailRow label="Amount">
              <MoneyValue
                amountMinor={parsed.amountMinor}
                currency={parsed.currency}
                tone={parsed.type === "income" ? "income" : "default"}
              />
            </DetailRow>
            <DetailRow label="Payee / merchant">
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {parsed.payeeOrMerchant}
              </Text>
            </DetailRow>
            <DetailRow label="Channel">
              <Text style={[typography.body, { color: theme.colors.text }]}>{parsed.channel}</Text>
            </DetailRow>
            <DetailRow label="Date">
              <Text style={[typography.body, { color: theme.colors.text }]}>{dateTime}</Text>
            </DetailRow>
            <DetailRow label="Category">
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {parsed.suggestedCategory}
              </Text>
            </DetailRow>
            <DetailRow label="Reference no.">
              <Text style={[typography.body, { color: theme.colors.text }]}>
                {parsed.referenceNumber ?? "—"}
              </Text>
            </DetailRow>
          </View>
        ) : null}
        {parsed ? (
          <View style={styles.actions}>
            <Button
              accessibilityHint="Opens the transaction editor with these details"
              icon="check"
              onPress={apply}
              variant="primary"
            >
              Use in transaction editor
            </Button>
            <Button
              onPress={() => {
                setSmsText("");
                setParsed(null);
                setParseError(null);
              }}
              variant="quiet"
            >
              Clear
            </Button>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  input: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },
  actions: { gap: spacing.sm },
  details: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailRow: { gap: 2 },
  detailLabel: { textTransform: "uppercase" },
  detailValue: { minWidth: 0 },
});
