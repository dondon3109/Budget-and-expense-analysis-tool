import { fireEvent, render, screen } from "@testing-library/react-native";

import { ApiTransportError } from "@/api/authenticated";
import { createShareLink } from "@/api/shares";

import { ShareLinkSheet } from "./ShareLinkSheet";

jest.mock("@/api/shares", () => ({ createShareLink: jest.fn() }));

jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ getAccessToken: jest.fn(async () => "token") }),
}));

const mockedCreate = jest.mocked(createShareLink);

describe("ShareLinkSheet", () => {
  beforeEach(() => mockedCreate.mockReset());

  it("sends only the fields the user kept and shows the returned link", async () => {
    mockedCreate.mockResolvedValue({
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
      sharerName: null,
      expiresAt: null,
    });
    await render(
      <ShareLinkSheet
        onDismiss={jest.fn()}
        target={{ kind: "transaction", id: "tx-1", hasNote: false }}
        visible
      />,
    );

    // No note on this transaction, so there is nothing to opt into.
    expect(screen.queryByLabelText("Note")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Date"));
    await fireEvent.press(screen.getByLabelText("No end"));
    await fireEvent.press(screen.getByLabelText("Create link"));

    expect(await screen.findByText("https://zoption.site/s#x7Kp_QeR-2mN8vLs4aBcDe")).toBeTruthy();
    expect(mockedCreate).toHaveBeenCalledWith(
      { accessToken: "token" },
      {
        kind: "transaction",
        transactionId: "tx-1",
        show: { description: false, category: true, date: false, note: false },
        sharerName: undefined,
        expiry: "never",
      },
    );
  });

  it("asks for a sync when the server has not seen the row yet", async () => {
    mockedCreate.mockRejectedValue(new ApiTransportError("Not found", "not_found", 404));
    await render(
      <ShareLinkSheet onDismiss={jest.fn()} target={{ kind: "balance", id: "acc-1" }} visible />,
    );

    await fireEvent.press(screen.getByLabelText("Create link"));

    expect(await screen.findByText(/has not synced this yet/u)).toBeTruthy();
  });
});
