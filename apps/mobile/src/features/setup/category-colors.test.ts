import { categoryColorOptions, isPresetCategoryColor } from "./category-colors";

describe("category color choices", () => {
  it("provides unique friendly names and valid six-digit colors", () => {
    expect(new Set(categoryColorOptions.map((option) => option.name)).size).toBe(
      categoryColorOptions.length,
    );
    expect(new Set(categoryColorOptions.map((option) => option.value)).size).toBe(
      categoryColorOptions.length,
    );
    for (const option of categoryColorOptions) {
      expect(option.name).toMatch(/^[A-Z][a-z]+$/);
      expect(option.value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("recognizes saved preset colors without depending on letter case", () => {
    expect(isPresetCategoryColor("#0f766e")).toBe(true);
    expect(isPresetCategoryColor("#123456")).toBe(false);
  });
});
