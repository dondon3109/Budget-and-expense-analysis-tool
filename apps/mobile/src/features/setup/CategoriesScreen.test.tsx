import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { useLocalReferenceData } from "@/db/local-workspace-state";
import type { LocalCategoryItem } from "@/db/repository";
import { CategoriesScreen } from "./CategoriesScreen";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  Stack: {
    Screen: () => null,
  },
}));

jest.mock("@/db/local-workspace-state", () => ({
  useLocalReferenceData: jest.fn(),
}));

const mockCategories: LocalCategoryItem[] = [
  {
    id: "category-groceries",
    name: "Groceries",
    kind: "expense",
    color: "#3B82F6",
    iconEmoji: "🛒",
    system: false,
    requiredPlan: "free",
    locked: false,
    serverRevision: 1,
    syncState: "synced",
  },
  {
    id: "category-salary",
    name: "Salary",
    kind: "income",
    color: "#0F6B5B",
    iconEmoji: "💼",
    system: false,
    requiredPlan: "free",
    locked: false,
    serverRevision: 1,
    syncState: "synced",
  },
];

describe("CategoriesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders categorized sections and opens category details when tapped", async () => {
    jest.mocked(useLocalReferenceData).mockReturnValue({
      data: { accounts: [], categories: mockCategories },
      error: null,
      retry: jest.fn(),
    });

    await render(<CategoriesScreen />);

    expect(screen.getByText("Expense Categories")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("🛒", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Income Categories")).toBeTruthy();
    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.getByText("💼", { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: /Groceries/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/reference",
      params: { entityType: "category", id: "category-groceries" },
    });
  });

  it("navigates to create a new category when Add is tapped", async () => {
    jest.mocked(useLocalReferenceData).mockReturnValue({
      data: { accounts: [], categories: mockCategories },
      error: null,
      retry: jest.fn(),
    });

    await render(<CategoriesScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Add category" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(app)/reference",
      params: { entityType: "category" },
    });
  });
});
