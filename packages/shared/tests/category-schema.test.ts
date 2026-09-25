import { describe, expect, it } from "vitest";

import {
  categoryInputSchema,
  categoryUpdateSchema,
  getDefaultCategoryEmoji,
  resolveCategoryEmoji,
  sortCategoriesForPicker,
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

describe("sortCategoriesForPicker", () => {
  it("lists plain-text categories A–Z before emoji categories A–Z", () => {
    const categories = [
      { name: "zoo", iconEmoji: null },
      { name: "Food", iconEmoji: "🍔" },
      { name: "Allowance", iconEmoji: null },
      { name: "🎮 Games", iconEmoji: null },
      { name: "bills", iconEmoji: null },
      { name: "Coffee", iconEmoji: "☕" },
    ];

    const sorted = sortCategoriesForPicker(categories, (category) => category.iconEmoji);

    expect(sorted.map((category) => category.name)).toEqual([
      "Allowance",
      "bills",
      "zoo",
      "Coffee",
      "Food",
      "🎮 Games",
    ]);
  });

  it("groups by the emoji the surface renders, including name defaults", () => {
    const categories = [{ name: "Groceries" }, { name: "Pets" }];

    const sorted = sortCategoriesForPicker(categories, resolveCategoryEmoji);

    expect(sorted.map((category) => category.name)).toEqual(["Pets", "Groceries"]);
  });
});
