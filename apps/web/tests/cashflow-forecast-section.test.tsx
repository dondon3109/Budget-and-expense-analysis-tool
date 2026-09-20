// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SubscriptionMonthItem } from "@zoption/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  CashflowForecastSection,
  type CashflowAccountOption,
} from "../src/components/subscriptions/CashflowForecastSection";
import { formatMoney } from "../src/lib/formatters";

function getFutureDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const mockItem: SubscriptionMonthItem = {
  id: "sub-1",
  name: "Cloud Storage Pro",
  amountMinor: 50_000,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: getFutureDate(5),
  billingDate: getFutureDate(5),
  status: "active",
  categoryId: "tech",
  categoryName: "Technology",
  categoryColor: "#2563eb",
  accountId: "acc-1",
  accountName: "Checking Account",
  monthlyCostMinor: 50_000,
};

const mockItem60Days: SubscriptionMonthItem = {
  id: "sub-2",
  name: "Annual Domain",
  amountMinor: 30_000,
  currency: "PHP",
  billingCycle: "monthly",
  nextBillingDate: getFutureDate(45),
  billingDate: getFutureDate(45),
  status: "active",
  categoryId: "tech",
  categoryName: "Technology",
  categoryColor: "#2563eb",
  accountId: "acc-1",
  accountName: "Checking Account",
  monthlyCostMinor: 30_000,
};

const mockAccounts: CashflowAccountOption[] = [
  {
    id: "acc-1",
    name: "Checking Account",
    balanceMinor: 200_000,
  },
  {
    id: "acc-2",
    name: "Savings Account",
    balanceMinor: 300_000,
  },
];

const lowBalanceAccounts: CashflowAccountOption[] = [
  { id: "acc-1", name: "Checking Account", balanceMinor: 10_000 },
];

const highBalanceAccounts: CashflowAccountOption[] = [
  { id: "acc-1", name: "Checking Account", balanceMinor: 5_000_000 },
];

function chartText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".projection-chart-svg text")).map(
    (node) => node.textContent ?? "",
  );
}

function dayHits(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll(".projection-day-hit"));
}

afterEach(cleanup);

describe("CashflowForecastSection", () => {
  it("renders the heading and one horizon tile per projected ending balance", () => {
    render(<CashflowForecastSection items={[mockItem, mockItem60Days]} accounts={mockAccounts} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Upcoming Balance & Obligation Forecast",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cashflow Projection")).toBeInTheDocument();

    const horizonGroup = screen.getByRole("group", { name: "Forecast horizon" });
    expect(horizonGroup).toBeInTheDocument();

    const tile30 = within(horizonGroup).getByRole("button", { name: /^30 days/ });
    const tile60 = within(horizonGroup).getByRole("button", { name: /^60 days/ });
    const tile90 = within(horizonGroup).getByRole("button", { name: /^90 days/ });

    // Each tile previews the balance the projection ends on, so the three horizons are comparable.
    expect(tile30).toHaveTextContent(formatMoney(450_000));
    expect(tile60).toHaveTextContent(formatMoney(370_000));
    expect(tile30).toHaveAttribute("aria-pressed", "true");
    expect(tile60).toHaveAttribute("aria-pressed", "false");
    expect(tile90).toHaveAttribute("aria-pressed", "false");
    expect(tile30).toHaveClass("active");
  });

  it("switches horizon from the tiles and redraws the whole line", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CashflowForecastSection items={[mockItem, mockItem60Days]} accounts={mockAccounts} />,
    );

    expect(dayHits(container)).toHaveLength(30);

    await user.click(screen.getByRole("button", { name: /^60 days/ }));
    expect(screen.getByRole("button", { name: /^60 days/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^30 days/ })).not.toHaveClass("active");
    expect(screen.getByText(/At day 60/)).toBeInTheDocument();
    expect(dayHits(container)).toHaveLength(60);

    await user.click(screen.getByRole("button", { name: /^90 days/ }));
    expect(screen.getByRole("button", { name: /^90 days/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/At day 90/)).toBeInTheDocument();
    expect(dayHits(container)).toHaveLength(90);
  });

  it("names the chart and repeats its story in the surrounding figures", () => {
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />,
    );

    const chart = screen.getByRole("img", { name: /Projected balance from/ });
    expect(chart).toHaveAttribute(
      "aria-label",
      expect.stringContaining(`ends at ${formatMoney(450_000)}`),
    );
    expect(chart).toHaveAttribute("aria-label", expect.stringContaining("No safety buffer set."));

    // The metric cards keep the same numbers in text for anyone who cannot see the line.
    expect(screen.getByText("Projected End Balance")).toBeInTheDocument();
    expect(screen.getByText("Lowest Projected Point")).toBeInTheDocument();
    expect(container.querySelector(".projection-summary-footer")).toHaveTextContent(
      formatMoney(450_000),
    );
  });

  it("marks the lowest projected point with its value and date", () => {
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={lowBalanceAccounts} />,
    );

    const minimum = container.querySelector(".projection-minimum");
    expect(minimum).not.toBeNull();
    expect(minimum?.textContent).toContain(formatMoney(-40_000));
    expect(minimum?.textContent).toContain(
      new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${getFutureDate(5)}T00:00:00Z`)),
    );
  });

  it("shades the deficit band and draws the zero line only when the scale reaches zero", () => {
    const deficitView = render(
      <CashflowForecastSection items={[mockItem]} accounts={lowBalanceAccounts} />,
    );
    expect(deficitView.container.querySelector(".projection-deficit-band")).not.toBeNull();
    expect(deficitView.container.querySelector(".projection-zero-line")).not.toBeNull();
    deficitView.unmount();

    const safeView = render(
      <CashflowForecastSection items={[mockItem]} accounts={highBalanceAccounts} />,
    );
    expect(safeView.container.querySelector(".projection-deficit-band")).toBeNull();
    expect(safeView.container.querySelector(".projection-zero-line")).toBeNull();
  });

  it("does not claim a zero crossing when the scale floor merely lands on zero", () => {
    // ₱1,000 against one ₱500 renewal never reaches zero, but the axis floor rounds down to it.
    const { container } = render(
      <CashflowForecastSection
        items={[mockItem]}
        accounts={[{ id: "acc-1", name: "Checking Account", balanceMinor: 100_000 }]}
      />,
    );

    expect(container.querySelector(".projection-zero-line")).toBeNull();
    expect(container.querySelector(".projection-deficit-band")).toBeNull();
    expect(screen.queryByText("Below ₱0")).not.toBeInTheDocument();
  });

  it("refuses a negative safety buffer instead of quietly treating it as zero", async () => {
    const user = userEvent.setup();
    render(<CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />);

    // Exactly "Safety buffer": the chart's aria-label also mentions a safety buffer.
    const bufferInput = screen.getByLabelText("Safety buffer");
    await user.clear(bufferInput);
    await user.type(bufferInput, "-500");

    expect(screen.getByText("Enter a reserve of zero or more.")).toBeInTheDocument();
    expect(bufferInput).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps a hover target with its date and balance on every day of the horizon", () => {
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />,
    );

    const hits = dayHits(container);
    expect(hits).toHaveLength(30);

    for (const hit of hits) {
      expect(hit.querySelector("title")?.textContent).toMatch(/^[A-Z][a-z]{2} \d+: /);
    }

    const billDay = hits.find((hit) =>
      hit.querySelector("title")?.textContent?.includes("Cloud Storage Pro"),
    );
    expect(billDay).toBeDefined();
    expect(billDay?.querySelector("title")?.textContent).toContain(formatMoney(450_000));
  });

  it("surfaces the hovered day's date, balance, and bills due", () => {
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />,
    );

    const hits = dayHits(container);
    const billDay = hits.find((hit) =>
      hit.querySelector("title")?.textContent?.includes("Cloud Storage Pro"),
    );
    fireEvent.mouseEnter(billDay!);

    const callout = container.querySelector(".projection-callout");
    expect(callout).not.toBeNull();
    expect(callout).toHaveTextContent(formatMoney(450_000));
    expect(callout).toHaveTextContent("Cloud Storage Pro");
    expect(callout).toHaveTextContent(`−${formatMoney(50_000)}`);

    // A day without bills still reports its date and closing balance.
    fireEvent.mouseEnter(hits[0]!);
    const quietDay = container.querySelector(".projection-callout");
    expect(quietDay).toHaveTextContent(formatMoney(500_000));
    expect(quietDay).toHaveTextContent("No bills due");
  });

  it("defaults the safety buffer to zero and keeps the projection unchanged", () => {
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />,
    );

    const input = screen.getByLabelText("Safety buffer");
    expect(input).toHaveValue("");
    expect(chartText(container).some((text) => text.startsWith("Buffer"))).toBe(false);
    expect(screen.getByText("Healthy Cashflow Projection")).toBeInTheDocument();
  });

  it("feeds the typed safety buffer into the projection, the chart, and the status banner", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />,
    );

    await user.type(screen.getByLabelText("Safety buffer"), "5000");

    // ₱5,000 of reserve against a balance that drops to ₱4,500 is a buffer dip, not a deficit.
    expect(screen.getByText("Low Buffer Warning")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `dips below your ${formatMoney(500_000)} safety buffer`,
    );
    expect(chartText(container)).toContain(`Buffer ${formatMoney(500_000)}`);
    expect(container.querySelector(".projection-legend")).toHaveTextContent(
      `Safety buffer ${formatMoney(500_000)}`,
    );
  });

  it("reports buffer text it cannot read and falls back to no buffer", async () => {
    const user = userEvent.setup();
    render(<CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />);

    const input = screen.getByLabelText("Safety buffer");
    await user.type(input, "12,34,5");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      "Enter a valid amount with no more than two decimal places.",
    );
    expect(screen.getByText("Healthy Cashflow Projection")).toBeInTheDocument();
  });

  it("displays deficit warning alert when starting balance is low/zero and bills exist", () => {
    const zeroBalanceAccounts: CashflowAccountOption[] = [
      {
        id: "acc-1",
        name: "Checking Account",
        balanceMinor: 0,
      },
    ];

    render(<CashflowForecastSection items={[mockItem]} accounts={zeroBalanceAccounts} />);

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(screen.getByText("Projected Shortfall Guidance")).toBeInTheDocument();
    expect(screen.getByText(/Your balance is projected to fall below zero/)).toBeInTheDocument();
  });

  it("displays safe status when starting balance is high", () => {
    render(<CashflowForecastSection items={[mockItem]} accounts={highBalanceAccounts} />);

    const statusBanner = screen.getByRole("status");
    expect(statusBanner).toBeInTheDocument();
    expect(screen.getByText("Healthy Cashflow Projection")).toBeInTheDocument();
    expect(
      screen.getByText(/All upcoming bill obligations are safely covered across the next 30 days/),
    ).toBeInTheDocument();
  });

  it("lists upcoming bills and risk badges", () => {
    render(<CashflowForecastSection items={[mockItem]} accounts={lowBalanceAccounts} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Upcoming Bill Obligations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cloud Storage Pro")).toBeInTheDocument();
    expect(screen.getAllByText("−₱500").length).toBeGreaterThanOrEqual(1);

    // ₱100 starting balance - ₱500 bill => deficit risk badge
    expect(screen.getByText("Deficit risk")).toBeInTheDocument();
  });

  it("scopes every obligations header and names the table for assistive tech", () => {
    render(<CashflowForecastSection items={[mockItem]} accounts={mockAccounts} />);

    const table = screen.getByRole("table", { name: "Upcoming bill obligations" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers).toHaveLength(5);
    for (const header of headers) {
      expect(header).toHaveAttribute("scope", "col");
    }
  });
});
