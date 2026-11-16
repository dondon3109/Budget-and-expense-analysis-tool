import { fireEvent, render, screen } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import type * as ReactNative from "react-native";

import { BudgetsTab } from "./BudgetsTab";

jest.mock("expo-router", () => ({
  router: { setParams: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
function mockView(label: string) {
  const { Text, View } = jest.requireActual<typeof ReactNative>("react-native");
  return function MockScreen({ viewSwitch }: { viewSwitch: ReactNode }) {
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
  beforeEach(() => jest.clearAllMocks());

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
});
