import { useState } from "react";
import { Text, View } from "react-native";
import { categoryInputSchema, type CategoryInput } from "@zoption/shared";

import { categoryColorOptions } from "@/features/setup/category-colors";
import { Button, Card, FormField } from "@/ui/components";
import { useZoptionTheme } from "@/ui/theme-provider";
import { typography } from "@/ui/tokens";

interface NewCategoryInlineProps {
  kind: CategoryInput["kind"];
  /** Rotates the palette so quick-added categories do not all share one color. */
  categoryCount: number;
  /** Writes the category (and its outbox row) and resolves with the new local id. */
  createCategory: (input: CategoryInput) => Promise<string>;
  onCreated: (categoryId: string) => void;
  onCancel: () => void;
}

/** Creates a category from inside the transaction editor so the entry in progress survives. */
export function NewCategoryInline({
  kind,
  categoryCount,
  createCategory,
  onCreated,
  onCancel,
}: NewCategoryInlineProps) {
  const theme = useZoptionTheme();
  const [name, setName] = useState("");
  const [iconEmoji, setIconEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    if (saving) return;
    if (!name.trim()) {
      setMessage("Enter a category name.");
      return;
    }
    const parsed = categoryInputSchema.safeParse({
      name,
      kind,
      color: categoryColorOptions[categoryCount % categoryColorOptions.length]!.value,
      iconEmoji: iconEmoji.trim() || null,
    });
    if (!parsed.success) {
      setMessage("Use a name of up to 80 characters and no more than one emoji icon.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      onCreated(await createCategory(parsed.data));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The category could not be saved to encrypted local storage.",
      );
      setSaving(false);
    }
  };

  return (
    <Card>
      <View className="gap-3">
        <FormField
          autoFocus
          editable={!saving}
          label="New category name"
          maxLength={80}
          onChangeText={(value) => {
            setName(value);
            setMessage(null);
          }}
          onSubmitEditing={() => void create()}
          placeholder="e.g. Pet care"
          returnKeyType="done"
          value={name}
        />
        <FormField
          autoCorrect={false}
          editable={!saving}
          label="Emoji icon (optional)"
          maxLength={32}
          onChangeText={(value) => {
            setIconEmoji(value);
            setMessage(null);
          }}
          value={iconEmoji}
        />
        {message ? (
          <Text
            accessibilityRole="alert"
            style={[typography.callout, { color: theme.colors.danger }]}
          >
            {message}
          </Text>
        ) : null}
        <Button disabled={saving} loading={saving} onPress={() => void create()}>
          Add category
        </Button>
        <Button disabled={saving} variant="quiet" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </Card>
  );
}
