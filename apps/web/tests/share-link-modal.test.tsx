// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", user_metadata: { display_name: "Don Estrera" } } }),
}));

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock([
    "createShareLink",
    "getAccounts",
    "getCategories",
    "shareTransactionToFamily",
  ]),
);

const families = vi.hoisted(() => ({
  list: [] as { id: string; kind: "family"; name: string; role: "owner" | "member" | "viewer" }[],
}));
vi.mock("../src/components/layout/ActiveWorkspaceProvider", () => ({
  useActiveWorkspace: () => ({ workspaces: families.list }),
}));

import { ShareLinkModal } from "../src/components/sharing/ShareLinkModal";
import {
  createShareLink,
  getAccounts,
  getCategories,
  shareTransactionToFamily,
} from "../src/lib/api";
import { renderWithProviders } from "./helpers/render";

afterEach(() => {
  cleanup();
  families.list = [];
});

const JOLLIBEE = {
  kind: "transaction",
  id: "tx-1",
  label: "Jollibee",
  hasNote: false,
  categoryName: "Food",
  direction: "expense",
} as const;

describe("ShareLinkModal", () => {
  it("sends only the fields the user kept and shows the returned link", async () => {
    vi.mocked(createShareLink).mockResolvedValue({
      id: "share-1",
      url: "https://zoption.site/s#x7Kp_QeR-2mN8vLs4aBcDe",
      snapshot: {
        kind: "transaction",
        direction: "expense",
        amountMinor: 25000,
        currency: "PHP",
        description: null,
        categoryName: "Food",
        date: null,
        note: null,
      },
      sharerName: "Don",
      expiresAt: null,
    });

    renderWithProviders(<ShareLinkModal target={JOLLIBEE} onClose={vi.fn()} />);

    // No note on this transaction, so there is nothing to opt into.
    expect(screen.queryByRole("checkbox", { name: "Note" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Date" }));
    fireEvent.change(screen.getByLabelText("Link works for"), { target: { value: "never" } });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByDisplayValue(/zoption\.site\/s#/u)).toBeInTheDocument();
    expect(vi.mocked(createShareLink).mock.calls[0]?.[1]).toEqual({
      kind: "transaction",
      transactionId: "tx-1",
      show: { description: false, category: true, date: false, note: false },
      sharerName: "Don",
      expiry: "never",
    });
  });

  it("copies into a family with the family category of the same name", async () => {
    families.list = [
      { id: "family:santos", kind: "family", name: "Santos family", role: "member" },
      { id: "family:lola", kind: "family", name: "Lola's house", role: "viewer" },
    ];
    vi.mocked(getAccounts).mockResolvedValue([
      { id: "family-cash", name: "Cash", archived: false },
    ] as never);
    vi.mocked(getCategories).mockResolvedValue([
      { id: "family-bills", name: "Bills", kind: "expense", archived: false },
      { id: "family-food", name: "food", kind: "expense", archived: false },
    ] as never);
    vi.mocked(shareTransactionToFamily).mockResolvedValue({} as never);

    renderWithProviders(<ShareLinkModal target={JOLLIBEE} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Family" }));
    // A viewer cannot write, so the only family offered needs no picker.
    expect(screen.queryByLabelText("Family")).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "food" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Share to Santos family" }));

    expect(await screen.findByText(/Copied to Santos family/u)).toBeInTheDocument();
    expect(vi.mocked(shareTransactionToFamily).mock.calls[0]?.[1]).toEqual({
      transactionId: "tx-1",
      accountId: "family-cash",
      categoryId: "family-food",
      includeNotes: false,
    });
  });
});
