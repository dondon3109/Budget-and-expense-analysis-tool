import { StyleSheet, Text, View } from "react-native";

import type { Currency, TransactionKind } from "@zoption/shared";
import { Button, Card, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { spacing, typography } from "@/ui/tokens";

export interface VoicePreviewDraftSummary {
  amountMinor: number;
  currency?: Currency;
  description: string;
  categoryName?: string;
  accountName?: string;
  kind?: TransactionKind;
}

export interface VoicePreviewCardProps {
  draft: VoicePreviewDraftSummary;
  remainingSeconds: number;
  saving?: boolean;
  error?: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onAutoSave?: () => void;
}

export function VoicePreviewCard({
  draft,
  remainingSeconds,
  saving = false,
  error = null,
  onEdit,
  onCancel,
}: VoicePreviewCardProps) {
  const theme = useZoptionTheme();

  const details = [draft.categoryName, draft.accountName].filter(Boolean).join(" · ");
  const countdownText = error
    ? error
    : saving
      ? "Saving..."
      : `Saving in ${remainingSeconds}s...`;

  const tone = draft.kind === "income" ? "income" : "expense";

  return (
    <Card accessibilityLabel="Voice expense preview">
      <View style={styles.headerRow}>
        <View style={styles.textContainer}>
          <Text style={[typography.headline, { color: theme.colors.text }]} numberOfLines={1}>
            {draft.description || "Expense"}
          </Text>
          {details ? (
            <Text style={[typography.callout, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {details}
            </Text>
          ) : null}
        </View>
        <MoneyValue
          amountMinor={draft.amountMinor}
          currency={draft.currency ?? "PHP"}
          tone={tone}
          style={typography.title}
        />
      </View>

      <View style={styles.footerRow}>
        <Text
          style={[
            typography.caption,
            { color: error ? theme.colors.danger : theme.colors.textMuted },
          ]}
        >
          {countdownText}
        </Text>
        <View style={styles.actionsRow}>
          <Button
            variant="quiet"
            size="compact"
            disabled={saving}
            onPress={onCancel}
            accessibilityLabel="Cancel"
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="compact"
            disabled={saving}
            onPress={onEdit}
            accessibilityLabel="Edit"
          >
            Edit
          </Button>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  textContainer: {
    flex: 1,
    gap: spacing.xxs,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
