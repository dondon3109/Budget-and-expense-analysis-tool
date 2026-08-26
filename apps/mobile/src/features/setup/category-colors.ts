export const categoryColorOptions = [
  { name: "Emerald", value: "#0F766E" },
  { name: "Blue", value: "#2563EB" },
  { name: "Violet", value: "#7C3AED" },
  { name: "Pink", value: "#DB2777" },
  { name: "Red", value: "#DC2626" },
  { name: "Orange", value: "#EA580C" },
  { name: "Amber", value: "#D97706" },
  { name: "Slate", value: "#475569" },
] as const;

export function isPresetCategoryColor(color: string): boolean {
  return categoryColorOptions.some((option) => option.value.toLowerCase() === color.toLowerCase());
}
