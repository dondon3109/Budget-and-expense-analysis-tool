import { render, screen } from "@testing-library/react-native";

import { useHideAmountsStore } from "@/stores/hide-amounts-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { MoneyValue } from "./MoneyValue";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

describe("MoneyValue workspace currency", () => {
  afterEach(() => useWorkspaceCurrencyStore.setState({ currency: "PHP" }));

  it("renders a currency-less amount in the workspace currency", async () => {
    useWorkspaceCurrencyStore.setState({ currency: "USD" });
    await render(<MoneyValue amountMinor={123456} />);
    expect(screen.getByText("$1,234.56")).toBeTruthy();
  });

  it("keeps an amount's own currency", async () => {
    useWorkspaceCurrencyStore.setState({ currency: "USD" });
    await render(<MoneyValue amountMinor={123456} currency="PHP" />);
    expect(screen.getByText("₱1,234.56")).toBeTruthy();
  });
});

describe("MoneyValue hide balance toggle", () => {
  afterEach(() => useHideAmountsStore.setState({ hidden: false }));

  it("masks the amount, its sign, and its spoken label while amounts are hidden", async () => {
    useHideAmountsStore.setState({ hidden: true });
    await render(<MoneyValue amountMinor={-123456} currency="PHP" />);
    expect(screen.queryByText(/1,234/)).toBeNull();
    expect(screen.getByText("₱••••")).toBeTruthy();
    expect(screen.getByLabelText("hidden amount")).toBeTruthy();
  });

  it("shows the amount again once the toggle is turned off", async () => {
    useHideAmountsStore.setState({ hidden: true });
    useHideAmountsStore.getState().toggle();
    await render(<MoneyValue amountMinor={123456} currency="PHP" />);
    expect(screen.getByText("₱1,234.56")).toBeTruthy();
  });
});
