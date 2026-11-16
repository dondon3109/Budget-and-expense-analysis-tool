import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, type ReactNode } from "react";
import type * as ReactNative from "react-native";

import { BudgetsTab } from "./BudgetsTab";

jest.mock("expo-router", () => ({
  router: { setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
const mockMounts: string[] = [];
function mockView(label: string) {
  const { Text, View } = jest.requireActual<typeof ReactNative>("react-native");
  return function MockScreen({ viewSwitch }: { viewSwitch: ReactNode }) {
    useEffect(() => {
      mockMounts.push(label);
    }, []);
    return (
      <View>
        {viewSwitch}
        <Text>{label}</Text>
      </View>
    );
  };
}
jest.mock("./BudgetsScreen", () => ({ BudgetsScreen: mockView("Budget plan") }));
jest.mock("@/features/subscriptions/SubscriptionsScreen", () => ({
  SubscriptionsScreen: mockView("Bill list"),
}));
jest.mock("@/features/sounds/sound-effects", () => ({
  withTapSound: (handler: () => void) => handler,
}));

describe("BudgetsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMounts.length = 0;
  });

  it("opens on budgets and switches to bills through the view param", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    await render(<BudgetsTab />);
    expect(screen.getByText("Budget plan")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Bills" }));
    expect(router.setParams).toHaveBeenCalledWith({ view: "bills" });
  });

  it("shows bills when a link asks for them", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ view: "bills" });
    await render(<BudgetsTab />);
    expect(screen.getByText("Bill list")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Bills", selected: true })).toBeTruthy();
  });

  it("keeps a view it switched away from mounted, so switching back does not reload it", async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    const { rerender } = await render(<BudgetsTab />);
    jest.mocked(useLocalSearchParams).mockReturnValue({ view: "bills" });
    await rerender(<BudgetsTab />);
    expect(screen.getByText("Bill list")).toBeTruthy();
    expect(screen.queryByText("Budget plan")).toBeNull();
    expect(screen.getByText("Budget plan", { includeHiddenElements: true })).toBeTruthy();

    jest.mocked(useLocalSearchParams).mockReturnValue({ view: "budgets" });
    await rerender(<BudgetsTab />);
    expect(screen.getByText("Budget plan")).toBeTruthy();
    expect(mockMounts).toEqual(["Budget plan", "Bill list"]);
  });
});
