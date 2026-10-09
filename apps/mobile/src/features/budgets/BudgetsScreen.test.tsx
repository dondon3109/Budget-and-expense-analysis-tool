import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { useBudgetOccasions, useBudgetPlan, useLocalWorkspace } from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { useSyncState } from "@/sync/sync-state";
import { BudgetsScreen } from "./BudgetsScreen";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isInternetReachable: true, isConnected: true })),
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));

// The test tree holds host views only, so expose the keyboard avoider and its behavior.
jest.mock("react-native/Libraries/Components/Keyboard/KeyboardAvoidingView", () => {
  const { createElement } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: (props: object) => createElement(View, { ...props, testID: "keyboard-avoiding-view" }),
  };
});

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: jest.fn(),
  useBudgetPlan: jest.fn(),
  useBudgetOccasions: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({
  useSyncState: jest.fn(),
}));

const DINING = {
  id: "cat-1",
  name: "Dining",
  kind: "expense" as const,
  color: "#FF5722",
  iconEmoji: "🍔",
  pending: false,
};
const FOOD = { ...DINING, id: "food", name: "Food & dining", color: "#e87ba4" };

function budget(
  overrides: Partial<{
    limitMinor: number;
    spentMinor: number;
    source: "month" | "every-month" | "occasion";
  }> = {},
) {
  return {
    id: "budget-1",
    categoryId: "cat-1",
    categoryName: "Dining",
    categoryColor: "#FF5722",
    limitMinor: 50_000,
    spentMinor: 20_000,
    source: "month" as const,
    syncState: "synced" as const,
    ...overrides,
  };
}

function mockPlan(
  budgets: ReturnType<typeof budget>[],
  categories = [DINING],
  event: { id: string; title: string; date: string } | null = null,
) {
  jest.mocked(useBudgetPlan).mockReturnValue({
    data: { budgets, categories, event },
    error: null,
    retry: jest.fn(),
  });
}

describe("BudgetsScreen", () => {
  const setBudgetLimit = jest.fn().mockResolvedValue(undefined);
  const createEvent = jest.fn().mockResolvedValue("event-1");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useSyncState).mockReturnValue({
      status: "synced",
      message: null,
      retry: jest.fn(),
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: { setBudgetLimit, createEvent },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useBudgetOccasions).mockReturnValue({
      occasions: [],
      error: null,
      retry: jest.fn(),
    });
  });

  it("shows what is left and one row per category, with no raised cards", async () => {
    mockPlan([budget()]);

    await render(<BudgetsScreen />);

    expect(screen.getByText("LEFT TO SPEND")).toBeTruthy();
    expect(screen.getByText("Dining")).toBeTruthy();
    expect(screen.getByText("🍔", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("flags a plan that is over, without a shaming label", async () => {
    mockPlan([budget({ limitMinor: 10_000, spentMinor: 12_000 })]);

    await render(<BudgetsScreen />);

    expect(screen.getByText("OVER PLAN BY")).toBeTruthy();
    expect(screen.queryByText("Over budget")).toBeNull();
  });

  it("offers an empty month a first budget and opens the editor", async () => {
    mockPlan([], [DINING]);

    await render(<BudgetsScreen />);
    expect(screen.getByText("Add a budget")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add a budget" }));

    expect(screen.getByRole("header", { name: "Add budget" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save new budget" })).toBeDisabled();
  });

  it("makes the category an explicit choice instead of defaulting to the first one", async () => {
    mockPlan([], [{ ...DINING, id: "debt", name: "Debt payment" }, FOOD]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add budget" }));
    expect(screen.getByRole("button", { name: "Save new budget" })).toBeDisabled();

    await fireEvent.press(screen.getByRole("radio", { name: "🍔 Food & dining" }));
    await fireEvent.changeText(screen.getByLabelText("Spending limit"), "100");
    await fireEvent.press(screen.getByRole("button", { name: "Save new budget" }));

    expect(setBudgetLimit).toHaveBeenCalledWith(
      { scope: "month", month: expect.stringMatching(/^\d{4}-\d{2}-01$/) },
      "food",
      10_000,
    );
  });

  it("saves a limit for every month when that scope is chosen", async () => {
    mockPlan([], [FOOD]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add budget" }));
    await fireEvent.press(screen.getByRole("radio", { name: "🍔 Food & dining" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Every month" }));
    await fireEvent.changeText(screen.getByLabelText("Limit each month"), "250");
    await fireEvent.press(screen.getByRole("button", { name: "Save new budget" }));

    expect(setBudgetLimit).toHaveBeenCalledWith({ scope: "every-month" }, "food", 25_000);
  });

  it("keeps the amount field and save button above the keyboard in the add sheet", async () => {
    mockPlan([], [FOOD]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add budget" }));

    const keyboardAvoider = screen.getByTestId("keyboard-avoiding-view");
    expect(keyboardAvoider.props.behavior).toBe("padding");
    expect(within(keyboardAvoider).getByLabelText("Spending limit")).toBeTruthy();
    expect(within(keyboardAvoider).getByRole("button", { name: "Save new budget" })).toBeTruthy();
  });

  it("offers a category again after its budget was removed to a zero limit", async () => {
    mockPlan(
      [
        budget({
          limitMinor: 0,
          spentMinor: 0,
        }),
      ].map((row) => ({
        ...row,
        id: "budget-food",
        categoryId: "food",
        categoryName: "Food & dining",
      })),
      [FOOD],
    );

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Add a budget" }));

    expect(screen.getByRole("radio", { name: "🍔 Food & dining" })).toBeTruthy();
  });

  it("marks a month row that comes from the every-month default", async () => {
    mockPlan([budget({ source: "every-month" })]);

    await render(<BudgetsScreen />);

    expect(screen.getByText(/·\s+Every month/)).toBeTruthy();
  });

  it("shows the every-month limits without any spending", async () => {
    mockPlan([budget({ source: "every-month", spentMinor: 0 })]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Every month" }));

    expect(screen.getByText("PLANNED EVERY MONTH")).toBeTruthy();
    expect(screen.getByText("Limit per month")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next month" })).toBeNull();
  });

  it("navigates months and shows the 'This month' return pill when shifted", async () => {
    mockPlan([], []);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Next month" }));

    expect(screen.getByText("This month")).toBeTruthy();
  });

  it("lists a month's occasions and opens one", async () => {
    mockPlan([budget({ source: "occasion" })], [DINING], {
      id: "event-1",
      title: "Mia birthday",
      date: "2026-08-15",
    });
    jest.mocked(useBudgetOccasions).mockReturnValue({
      occasions: [
        {
          eventId: "event-1",
          title: "Mia birthday",
          date: "2026-08-15",
          totalLimitMinor: 80_000,
          totalSpentMinor: 50_000,
        },
      ],
      error: null,
      retry: jest.fn(),
    });

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Occasions" }));
    await fireEvent.press(screen.getByRole("button", { name: /Mia birthday/ }));

    expect(screen.getByText("LEFT FOR THIS OCCASION")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to occasions" })).toBeTruthy();
  });

  it("creates an occasion as a calendar event with its first limit", async () => {
    mockPlan([], [FOOD]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Occasions" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "New occasion" })[0]!);
    await fireEvent.changeText(screen.getByLabelText("Occasion"), "Mia's party");
    await fireEvent.changeText(screen.getByLabelText("Date"), "2026-08-15");
    await fireEvent.press(screen.getByRole("radio", { name: "🍔 Food & dining" }));
    await fireEvent.changeText(screen.getByLabelText("Limit for this category"), "800");
    await fireEvent.press(screen.getByRole("button", { name: "Create occasion" }));

    expect(createEvent).toHaveBeenCalledWith({ title: "Mia's party", date: "2026-08-15" });
    expect(setBudgetLimit).toHaveBeenCalledWith(
      { scope: "occasion", eventId: "event-1" },
      "food",
      80_000,
    );
  });

  it("asks for a name and date before creating an occasion", async () => {
    mockPlan([], [FOOD]);

    await render(<BudgetsScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Occasions" }));
    await fireEvent.press(screen.getAllByRole("button", { name: "New occasion" })[0]!);
    await fireEvent.changeText(screen.getByLabelText("Date"), "soon");
    await fireEvent.press(screen.getByRole("button", { name: "Create occasion" }));

    expect(createEvent).not.toHaveBeenCalled();
    expect(screen.getByText("Check the highlighted details.")).toBeTruthy();
  });
});
