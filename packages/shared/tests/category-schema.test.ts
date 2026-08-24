import { describe, expect, it } from "vitest";

import {
  categoryInputSchema,
  categoryUpdateSchema,
  getDefaultCategoryEmoji,
  resolveCategoryEmoji,
} from "../src/schemas";

describe("category emoji schemas", () => {
  it.each(["🍔", "👩🏽‍💻", "🇵🇭", "1️⃣"])("accepts one emoji cluster: %s", (iconEmoji) => {
    expect(
      categoryInputSchema.safeParse({
        name: "Custom",
        kind: "expense",
        color: "#123456",
        iconEmoji,
      }).success,
    ).toBe(true);
  });

  it.each(["food", "🍔🍟", "🍔 food"])("rejects a non-icon emoji value: %s", (iconEmoji) => {
    expect(categoryUpdateSchema.safeParse({ iconEmoji }).success).toBe(false);
  });

  it("allows an icon to be cleared", () => {
    expect(categoryUpdateSchema.safeParse({ iconEmoji: null }).success).toBe(true);
  });

  it("resolves default emojis for built-in category names", () => {
    expect(getDefaultCategoryEmoji("Salary")).toBe("💼");
    expect(getDefaultCategoryEmoji("Housing")).toBe("🏠");
    expect(getDefaultCategoryEmoji("Food & dining")).toBe("🍔");
    expect(getDefaultCategoryEmoji("Dining & Food")).toBe("🍔");
    expect(getDefaultCategoryEmoji("Transport")).toBe("🚗");
    expect(getDefaultCategoryEmoji("Utilities")).toBe("💡");
    expect(getDefaultCategoryEmoji("Leisure")).toBe("🎁");
    expect(getDefaultCategoryEmoji("Savings transfer")).toBe("💰");
    expect(getDefaultCategoryEmoji("Groceries")).toBe("🛒");
    expect(getDefaultCategoryEmoji("Healthcare")).toBe("💊");
    expect(getDefaultCategoryEmoji("Unknown Category")).toBeNull();
  });

  it("resolves explicit iconEmoji over default fallback", () => {
    expect(resolveCategoryEmoji({ name: "Food", iconEmoji: "🍕" })).toBe("🍕");
    expect(resolveCategoryEmoji({ name: "Food", iconEmoji: null })).toBe("🍔");
    expect(resolveCategoryEmoji({ name: "Custom", iconEmoji: null })).toBeNull();
  });
});
