import { useEffect, useState } from "react";
import { Clipboard, Pressable, StyleSheet, Text, View } from "react-native";

import { createSharedBudgetPayload, encodeSharedBudgetToken } from "@zoption/shared";
import { BottomSheet, Button, MoneyValue } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, typography } from "@/ui/tokens";
import type { BudgetMonthRow } from "./budget-month-view";

export type ShareExpiry = "7" | "30" | "permanent";

export const SHARED_BUDGET_BASE_URL = "https://zoption.site/shared/budget";

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "permanent", label: "No expiry" },
];

interface ShareBudgetSheetProps {
  visible: boolean;
  onDismiss: () => void;
  rows: BudgetMonthRow[];
  month: string;
  monthLabel: string;
  copyLink?: (url: string) => void;
}

const defaultCopyLink = (url: string): void => {
  Clipboard.setString(url);
};

export function ShareBudgetSheet({
  visible,
  onDismiss,
  rows,
  month,
  monthLabel,
  copyLink = defaultCopyLink,
}: ShareBudgetSheetProps) {
  const theme = useZoptionTheme();
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    rows.map((row) => row.categoryId),
  );
  const [expiry, setExpiry] = useState<ShareExpiry>("7");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds(rows.map((row) => row.categoryId));
    setExpiry("7");
    setShareUrl(null);
    setCopied(false);
    setError(null);
  }, [visible, rows]);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.categoryId));

  const invalidateLink = (): void => {
    setShareUrl(null);
    setCopied(false);
    setError(null);
  };

  const toggleCategory = (categoryId: string): void => {
    invalidateLink();
    setSelectedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  };

  const changeExpiry = (value: ShareExpiry): void => {
    invalidateLink();
    setExpiry(value);
  };

  const generate = (): void => {
    if (selectedRows.length === 0) {
      setShareUrl(null);
      setCopied(false);
      setError("Select at least one envelope to share.");
      return;
    }
    setError(null);
    setCopied(false);
    const payload = createSharedBudgetPayload({
      title: `Family Budget - ${monthLabel}`,
      month,
      categories: selectedRows.map((row) => ({
        id: row.categoryId,
        name: row.categoryName,
        color: row.categoryColor,
        allocatedLimitMinor: row.limitMinor,
        spentMinor: row.spentMinor,
      })),
      ...(expiry === "permanent" ? {} : { expiresInDays: Number(expiry) }),
    });
    setShareUrl(`${SHARED_BUDGET_BASE_URL}/${encodeSharedBudgetToken(payload)}`);
  };

  const copy = (): void => {
    if (!shareUrl) return;
    copyLink(shareUrl);
    setCopied(true);
  };

  return (
    <BottomSheet onDismiss={onDismiss} title="Share envelopes" visible={visible}>
      <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
        Generate a tamper-evident, view-only link for family. Only the selected envelope totals
        are included.
      </Text>

      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.colors.text }]}>
          Envelopes to include ({selectedRows.length} of {rows.length})
        </Text>
        {rows.length === 0 ? (
          <Text style={[typography.callout, { color: theme.colors.textMuted }]}>
            No envelopes to share yet. Add a category budget first.
          </Text>
        ) : (
          <View style={styles.optionList}>
            {rows.map((row) => {
              const checked = selectedIds.includes(row.categoryId);
              return (
                <Pressable
                  key={row.categoryId}
                  accessibilityLabel={`Share ${row.categoryName}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
                  onPress={() => toggleCategory(row.categoryId)}
                  style={[
                    styles.envelopeRow,
                    {
                      backgroundColor: checked
                        ? theme.colors.brandSoft
                        : theme.colors.surfaceRaised,
                      borderColor: checked ? theme.colors.brand : theme.colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: checked ? theme.colors.brand : theme.colors.textMuted,
                        backgroundColor: checked ? theme.colors.brand : "transparent",
                      },
                    ]}
                  >
                    {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View
                    accessibilityElementsHidden
                    style={[styles.colorDot, { backgroundColor: row.categoryColor }]}
                  />
                  <View style={styles.envelopeInfo}>
                    <Text
                      numberOfLines={1}
                      style={[typography.headline, { color: theme.colors.text, fontSize: 15 }]}
                    >
                      {row.categoryName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[typography.caption, { color: theme.colors.textMuted }]}
                    >
                      <MoneyValue amountMinor={row.spentMinor} tone="expense" /> of{" "}
                      <MoneyValue amountMinor={row.limitMinor} />
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[typography.label, { color: theme.colors.text }]}>Link expiry</Text>
        <View style={styles.expiryRow}>
          {EXPIRY_OPTIONS.map((option) => {
            const selected = expiry === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                android_ripple={{ color: "rgba(15, 107, 91, 0.12)", borderless: false }}
                onPress={() => changeExpiry(option.value)}
                style={[
                  styles.expiryPill,
                  {
                    backgroundColor: selected
                      ? theme.colors.brandSoft
                      : theme.colors.surfaceRaised,
                    borderColor: selected ? theme.colors.brand : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.label,
                    { color: selected ? theme.colors.brand : theme.colors.textMuted },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={[typography.callout, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : null}

      {shareUrl ? (
        <View
          style={[
            styles.linkCard,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[typography.label, { color: theme.colors.text }]}>View-only link</Text>
          <Text
            accessibilityLabel="Generated share link"
            numberOfLines={3}
            style={[typography.caption, { color: theme.colors.textMuted }]}
          >
            {shareUrl}
          </Text>
          <Button accessibilityLabel="Copy Link" icon="content-copy" onPress={copy} variant="primary">
            {copied ? "Copied" : "Copy Link"}
          </Button>
          {copied ? (
            <Text style={[typography.caption, { color: theme.colors.income }]}>
              Link copied to clipboard.
            </Text>
          ) : (
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
              {expiry === "permanent"
                ? "This link never expires. Share it only with people you trust."
                : `Anyone with this link can view these envelope totals for ${expiry} days.`}
            </Text>
          )}
        </View>
      ) : null}

      <Button
        accessibilityLabel="Generate share link"
        disabled={rows.length === 0}
        icon="link-variant"
        onPress={generate}
        variant="primary"
      >
        Generate link
      </Button>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  optionList: {
    gap: spacing.xs,
  },
  envelopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "700",
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: radii.round,
  },
  envelopeInfo: {
    flex: 1,
    gap: 2,
  },
  expiryRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  expiryPill: {
    flex: 1,
    alignItems: "center",
    borderRadius: radii.round,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
});
