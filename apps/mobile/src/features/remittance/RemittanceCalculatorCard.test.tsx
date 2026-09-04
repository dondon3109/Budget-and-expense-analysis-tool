import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  calculateRemittance,
  compareRemittanceProviders,
  DEFAULT_OFW_EXCHANGE_RATES,
} from "@zoption/shared";
import { formatMoneyMinor } from "@/ui/components/MoneyValue";
import { RemittanceCalculatorCard } from "./RemittanceCalculatorCard";

describe("RemittanceCalculatorCard", () => {
  it("renders the dual-currency route with the mid-market benchmark and default net PHP", async () => {
    await render(<RemittanceCalculatorCard />);

    expect(screen.getByText("USD → PHP")).toBeTruthy();
    expect(
      screen.getByText(
        `Mid-market benchmark: 1 USD = ₱${DEFAULT_OFW_EXCHANGE_RATES.USD.midMarketRate.toFixed(2)}`,
      ),
    ).toBeTruthy();

    const expected = calculateRemittance({
      sendAmountMinor: 50000,
      fromCurrency: "USD",
      provider: "wise",
      transferFeeMinor: 0,
    });
    expect(
      screen.getAllByText(formatMoneyMinor(expected.netPhpReceivedMinor, "PHP"))[0],
    ).toBeTruthy();
    expect(
      screen.getByText(`Effective rate: 1 USD = ₱${expected.effectiveRate.toFixed(4)}`),
    ).toBeTruthy();
  });

  it("recalculates the net received amount when the send amount changes", async () => {
    await render(<RemittanceCalculatorCard />);

    await fireEvent.changeText(screen.getByLabelText("Send amount (USD)"), "1000");

    const expected = calculateRemittance({
      sendAmountMinor: 100000,
      fromCurrency: "USD",
      provider: "wise",
      transferFeeMinor: 0,
    });
    expect(
      screen.getAllByText(formatMoneyMinor(expected.netPhpReceivedMinor, "PHP"))[0],
    ).toBeTruthy();
  });

  it("shows the transfer fee breakdown converted to PHP with spread loss", async () => {
    await render(<RemittanceCalculatorCard />);

    await fireEvent.changeText(screen.getByLabelText("Transfer fee (USD)"), "5");

    const expected = calculateRemittance({
      sendAmountMinor: 50000,
      fromCurrency: "USD",
      provider: "wise",
      transferFeeMinor: 500,
    });
    expect(
      screen.getByText(`−${formatMoneyMinor(expected.transferFeeInPhpMinor, "PHP")}`),
    ).toBeTruthy();
    expect(
      screen.getByText(`−${formatMoneyMinor(expected.spreadLossPhpMinor, "PHP")}`),
    ).toBeTruthy();
    expect(
      screen.getByText(`Total cost · ${expected.effectiveLossPercent.toFixed(2)}% drag`),
    ).toBeTruthy();
  });

  it("switches provider rates when a different provider tab is pressed", async () => {
    await render(<RemittanceCalculatorCard />);

    await fireEvent.press(screen.getByRole("tab", { name: "Remitly" }));

    const expected = calculateRemittance({
      sendAmountMinor: 50000,
      fromCurrency: "USD",
      provider: "remitly",
      transferFeeMinor: 0,
    });
    expect(
      screen.getAllByText(formatMoneyMinor(expected.netPhpReceivedMinor, "PHP"))[0],
    ).toBeTruthy();
    expect(
      screen.getByText(`Effective rate: 1 USD = ₱${expected.effectiveRate.toFixed(4)}`),
    ).toBeTruthy();
  });

  it("compares all four providers and flags the best value", async () => {
    await render(<RemittanceCalculatorCard />);

    const comparison = compareRemittanceProviders(50000, "USD");
    const labels = {
      wise: "Wise",
      remitly: "Remitly",
      western_union: "Western Union",
      bank_wire: "Bank Wire",
    } as const;
    for (const provider of ["wise", "remitly", "western_union", "bank_wire"] as const) {
      const entry = comparison[provider];
      expect(entry).toBeDefined();
      expect(
        screen.getAllByText(formatMoneyMinor(entry!.netPhpReceivedMinor, "PHP")).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByLabelText(
          `${labels[provider]}: net ${formatMoneyMinor(entry!.netPhpReceivedMinor, "PHP")}${provider === "wise" ? ", best value" : ""}`,
        ),
      ).toBeTruthy();
    }

    // Wise carries the lowest spread, so it keeps the best-value badge by default.
    expect(screen.getByText("Best value")).toBeTruthy();
    expect(
      screen.getByLabelText(/Wise: net .* best value/),
    ).toBeTruthy();
  });

  it("recalculates when the origin currency changes", async () => {
    await render(<RemittanceCalculatorCard />);

    await fireEvent.press(screen.getByRole("tab", { name: "AED, UAE Dirham" }));

    expect(screen.getByText("AED → PHP")).toBeTruthy();
    const expected = calculateRemittance({
      sendAmountMinor: 50000,
      fromCurrency: "AED",
      provider: "wise",
      transferFeeMinor: 0,
    });
    expect(
      screen.getAllByText(formatMoneyMinor(expected.netPhpReceivedMinor, "PHP"))[0],
    ).toBeTruthy();
  });
});
