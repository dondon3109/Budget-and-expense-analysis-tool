// Category list query, input, emoji defaults, and picker ordering.

import { z } from "zod";

import { transactionKinds } from "../types";

export const categoryListQuerySchema = z
  .object({
    includeArchived: z.enum(["true", "false"]).optional().default("false"),
  })
  .strict()
  .transform((value) => ({ includeArchived: value.includeArchived === "true" }));

export const categoryIconEmojiSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .refine(
    (value) =>
      /^(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u.test(
        value,
      ),
    "Choose one emoji.",
  );

export const DEFAULT_CATEGORY_EMOJIS: Readonly<Record<string, string>> = {
  salary: "💼",
  income: "💼",
  housing: "🏠",
  rent: "🏠",
  food: "🍔",
  dining: "🍔",
  "food & dining": "🍔",
  "dining & food": "🍔",
  groceries: "🛒",
  grocery: "🛒",
  transport: "🚗",
  transportation: "🚗",
  travel: "✈️",
  utilities: "💡",
  "utilities & bills": "💡",
  bills: "💡",
  leisure: "🎁",
  shopping: "🎁",
  gifts: "🎁",
  healthcare: "💊",
  health: "💊",
  medical: "💊",
  "savings transfer": "💰",
  "savings-transfer": "💰",
  savings: "💰",
  education: "📚",
  fitness: "🏋️",
  entertainment: "🎬",
  interest: "📈",
  investment: "📈",
  investments: "📈",
};

export function getDefaultCategoryEmoji(name?: string | null): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  if (DEFAULT_CATEGORY_EMOJIS[normalized]) {
    return DEFAULT_CATEGORY_EMOJIS[normalized];
  }
  for (const [key, emoji] of Object.entries(DEFAULT_CATEGORY_EMOJIS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return emoji;
    }
  }
  return null;
}

export function resolveCategoryEmoji(
  category?: { name?: string | null; iconEmoji?: string | null; kind?: string | null } | null,
): string | null {
  if (!category) return null;
  if (category.iconEmoji && category.iconEmoji.trim()) {
    return category.iconEmoji.trim();
  }
  return getDefaultCategoryEmoji(category.name);
}

const pictographPattern = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const pictographGlobalPattern =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu;

/** Picker order: categories shown as plain text A–Z, then categories shown with an emoji A–Z.
 *  `emojiOf` returns the emoji the surface actually renders beside the name, so the
 *  grouping matches what the user sees; an emoji typed into the name also counts. */
export function sortCategoriesForPicker<T extends { name: string }>(
  categories: readonly T[],
  emojiOf: (category: T) => string | null | undefined,
): T[] {
  const hasEmoji = (category: T) =>
    Boolean(emojiOf(category)?.trim()) || pictographPattern.test(category.name);
  const sortName = (category: T) => category.name.replace(pictographGlobalPattern, "").trim();
  return [...categories].sort((left, right) => {
    const groupOrder = Number(hasEmoji(left)) - Number(hasEmoji(right));
    if (groupOrder !== 0) return groupOrder;
    return sortName(left).localeCompare(sortName(right), "en", { sensitivity: "base" });
  });
}

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(transactionKinds),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color."),
    iconEmoji: categoryIconEmojiSchema.nullable().optional(),
  })
  .strict();

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    iconEmoji: categoryIconEmojiSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one change.");

export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
