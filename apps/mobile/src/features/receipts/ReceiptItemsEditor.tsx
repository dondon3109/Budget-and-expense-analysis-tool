import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withTapSound } from "@/features/sounds/sound-effects";
import { Card, FormField, SelectionField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";

import { MAX_RECEIPT_REVIEW_ITEMS, type ReceiptReviewItem } from "./receipt-review";

interface CategoryOption {
  id: string;
  label: string;
  color: string;
}

/** Editable list of itemized receipt lines shown during mobile receipt review. */
export function ReceiptItemsEditor({
  items,
  categoryOptions,
  saving,
  onUpdate,
  onRemove,
  onAdd,
}: {
  items: readonly ReceiptReviewItem[];
  categoryOptions: CategoryOption[];
  saving: boolean;
  onUpdate: (id: string, update: Partial<ReceiptReviewItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const theme = useZoptionTheme();
  return (
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
          {items.length}/{MAX_RECEIPT_REVIEW_ITEMS}
        </Text>
      </View>
      {items.map((item, index) => (
        <Card key={item.id} style={styles.itemCard}>
          <View className="flex-row items-center justify-between gap-3">
            <Text style={[typography.label, { color: theme.colors.text }]}>Item {index + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove item ${index + 1}`}
              accessibilityState={{ disabled: items.length === 1 || saving }}
              disabled={items.length === 1 || saving}
              onPress={withTapSound(() => onRemove(item.id))}
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
              <Text style={[typography.label, { color: theme.colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
          <FormField
            label="Description"
            value={item.description}
            onChangeText={(value) => onUpdate(item.id, { description: value })}
            placeholder="e.g. Chickenjoy"
            maxLength={160}
          />
          <FormField
            label="Amount"
            value={item.amount}
            onChangeText={(value) => onUpdate(item.id, { amount: value })}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <SelectionField
            label="Category"
            value={item.categoryId}
            options={categoryOptions}
            placeholder="Choose a category"
            sheetTitle={`Category for item ${index + 1}`}
            onSelect={(categoryId) => onUpdate(item.id, { categoryId })}
          />
        </Card>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add receipt item"
        accessibilityState={{ disabled: items.length >= MAX_RECEIPT_REVIEW_ITEMS || saving }}
        disabled={items.length >= MAX_RECEIPT_REVIEW_ITEMS || saving}
        onPress={withTapSound(onAdd)}
        style={({ pressed }) => [
          styles.addItem,
          {
            backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: items.length >= MAX_RECEIPT_REVIEW_ITEMS || saving ? 0.45 : 1,
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
  );
}

const styles = StyleSheet.create({
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
});
