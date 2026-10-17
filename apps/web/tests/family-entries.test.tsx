// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { FamilyEntryView, TransactionListItem } from "@zoption/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "getFamily",
    "getFamilyEntryHistory",
    "getFamilyDeletedEntries",
    "restoreFamilyEntry",
  ]),
);

import { FamilyEntryHistoryDialog } from "../src/components/family/FamilyEntryHistoryDialog";
import { RecentlyDeletedEntries } from "../src/components/family/RecentlyDeletedEntries";
import {
  getFamily,
  getFamilyDeletedEntries,
  getFamilyEntryHistory,
  restoreFamilyEntry,
} from "../src/lib/api";
import { familyWorkspace } from "../src/lib/workspace";
import { renderWithProviders } from "./helpers/render";

afterEach(cleanup);

const RICE: FamilyEntryView = {
  date: "2026-10-17",
  description: "Rice",
  amountMinor: -120_000,
  currency: "PHP",
  kind: "expense",
  categoryName: "Food",
  accountName: "Cash",
  notes: null,
};

function familyAs(userId: string, role: "owner" | "member") {
  vi.mocked(getFamily).mockResolvedValue({
    role,
    closesAt: null,
    members: [{ userId: "kuya", email: "kuya@example.com" }],
  } as never);
  return familyWorkspace({ id: userId } as never, "family:santos");
}

describe("family entry history", () => {
  it("names who changed an entry and only the fields that changed", async () => {
    const family = familyAs("mama", "owner");
    vi.mocked(getFamilyEntryHistory).mockResolvedValue([
      {
        action: "updated",
        userId: "kuya",
        at: "2026-10-17T10:00:00.000Z",
        before: RICE,
        after: { ...RICE, amountMinor: -150_000 },
      },
    ]);

    renderWithProviders(
      <FamilyEntryHistoryDialog
        family={family}
        item={{ id: "rice", description: "Rice" } as TransactionListItem}
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByText(/kuya@example.com changed it/u)).toBeInTheDocument();
    expect(screen.getByText("Amount: ₱1,200 → ₱1,500")).toBeInTheDocument();
    expect(screen.queryByText(/^Category:/u)).not.toBeInTheDocument();
  });

  it("offers a member Restore only for what they deleted", async () => {
    const family = familyAs("kuya", "member");
    const deleted = (transactionId: string, deletedByUserId: string) => ({
      transactionId,
      entry: { ...RICE, description: transactionId },
      deletedByUserId,
      deletedAt: "2026-10-17T10:00:00.000Z",
      restoreUntil: "2026-11-16T10:00:00.000Z",
    });
    vi.mocked(getFamilyDeletedEntries).mockResolvedValue([
      deleted("Mine", "kuya"),
      deleted("Mama's", "mama"),
    ]);
    vi.mocked(restoreFamilyEntry).mockResolvedValue(undefined);

    renderWithProviders(<RecentlyDeletedEntries family={family} />);
    await screen.findByText(/Mama's/u);
    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[0]!);

    expect(restoreButtons).toHaveLength(1);
    await vi.waitFor(() => expect(restoreFamilyEntry).toHaveBeenCalledWith(family, "Mine"));
  });
});
