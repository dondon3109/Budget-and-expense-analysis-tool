// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { FamilyRemittanceOverview } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "getRemittanceOverview",
    "getFamily",
    "getAccounts",
    "getCategories",
    "receiveRemittance",
  ]),
);

import { RemittanceCard } from "../src/components/family/RemittanceCard";
import {
  getAccounts,
  getCategories,
  getFamily,
  getRemittanceOverview,
  receiveRemittance,
} from "../src/lib/api";
import { familyWorkspace } from "../src/lib/workspace";
import { renderWithProviders } from "./helpers/render";

afterEach(cleanup);

const family = familyWorkspace({ id: "mama" } as never, "family:santos");

const OVERVIEW: FamilyRemittanceOverview = {
  currency: "PHP",
  month: { month: "2026-10-01", sentMinor: 0, spentMinor: 120_000 },
  leftMinor: 50_000,
  pending: [
    {
      id: "remit-1",
      sentByUserId: "kuya",
      sentAmountMinor: 50_000,
      sentCurrency: "USD",
      feeMinor: 0,
      provider: "Wise",
      sentOn: "2026-10-02",
      note: null,
      received: null,
    },
  ],
  recent: [],
  history: [],
  hasRemittances: true,
};

describe("RemittanceCard", () => {
  it("confirms a pending send with the pesos that arrived", async () => {
    vi.mocked(getRemittanceOverview).mockResolvedValue(OVERVIEW);
    vi.mocked(getFamily).mockResolvedValue({ role: "owner", members: [], closesAt: null } as never);
    vi.mocked(getAccounts).mockResolvedValue([
      { id: "cash", name: "Cash", archived: false },
    ] as never);
    vi.mocked(getCategories).mockResolvedValue([
      { id: "interest", name: "Interest", kind: "income", archived: false, systemKey: null },
      { id: "padala", name: "Padala", kind: "income", archived: false, systemKey: null },
    ] as never);
    vi.mocked(receiveRemittance).mockResolvedValue({} as never);

    renderWithProviders(<RemittanceCard family={family} month="2026-10" />);
    expect(await screen.findByText(/500 on the way/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm received" }));
    await screen.findByRole("option", { name: "Padala" });
    fireEvent.change(screen.getByLabelText("Amount that arrived (PHP)"), {
      target: { value: "28,150" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm received" }).at(-1)!);

    await vi.waitFor(() => expect(receiveRemittance).toHaveBeenCalled());
    expect(vi.mocked(receiveRemittance).mock.calls[0]?.slice(1)).toEqual([
      "remit-1",
      { amountMinor: 2_815_000, accountId: "cash", categoryId: "padala", date: expect.any(String) },
    ]);
  });
});
