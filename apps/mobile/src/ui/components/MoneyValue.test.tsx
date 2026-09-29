import { render, screen } from "@testing-library/react-native";

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
