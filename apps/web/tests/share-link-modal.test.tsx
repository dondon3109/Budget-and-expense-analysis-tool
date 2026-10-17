// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "user-1", user_metadata: { display_name: "Don Estrera" } } }),
}));

vi.mock("../src/lib/api", async () =>
  (await import("./helpers/api-mock")).createApiMock(["createShareLink"]),
);

import { ShareLinkModal } from "../src/components/sharing/ShareLinkModal";
import { createShareLink } from "../src/lib/api";
import { renderWithProviders } from "./helpers/render";

afterEach(cleanup);

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

    renderWithProviders(
      <ShareLinkModal
        target={{ kind: "transaction", id: "tx-1", label: "Jollibee", hasNote: false }}
        onClose={vi.fn()}
      />,
    );

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
});
