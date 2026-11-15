import { categoryColorOptions, hexToHsv, hsvToHex, isPresetCategoryColor } from "./category-colors";

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

describe("custom color sliders", () => {
  it("round-trips every preset through hue, vividness, and brightness", () => {
    for (const option of categoryColorOptions) {
      const hsv = hexToHsv(option.value);
      expect(hsv).not.toBeNull();
      expect(hsvToHex(hsv!)).toBe(option.value);
    }
  });

  it("maps the slider ends to pure colors, white, and black", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#FF0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00FF00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000FF");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#FF0000");
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe("#FFFFFF");
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe("#000000");
  });

  it("rejects incomplete hex codes", () => {
    expect(hexToHsv("#0F76")).toBeNull();
    expect(hexToHsv("0F766E")).toBeNull();
    expect(hexToHsv("#0f766e")).toEqual(hexToHsv("#0F766E"));
  });
});
