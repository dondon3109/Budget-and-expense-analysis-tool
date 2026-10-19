import { parseSendForm } from "./remittance-form";

const send = {
  amount: "500",
  currency: "USD" as const,
  fee: "",
  provider: " Wise ",
  sentOn: "2026-10-10",
  note: "",
};
const arrival = { amount: "28,000", accountId: "a", categoryId: "c", date: "2026-10-12" };

describe("parseSendForm", () => {
  it("builds a send with its arrival in minor units, dropping blank extras", () => {
    expect(parseSendForm(send, arrival)).toEqual({
      success: true,
      input: {
        sentAmountMinor: 50_000,
        sentCurrency: "USD",
        provider: "Wise",
        sentOn: "2026-10-10",
        received: { amountMinor: 2_800_000, accountId: "a", categoryId: "c", date: "2026-10-12" },
      },
    });
  });

  it("names every field that blocks saving", () => {
    expect(
      parseSendForm({ ...send, amount: "0", fee: "-1" }, { ...arrival, accountId: "" }),
    ).toEqual({
      success: false,
      errors: {
        sentAmount: "Enter the amount you sent.",
        fee: "Enter the fee, or leave it blank.",
        account: "Choose the account it landed in.",
      },
    });
  });
});
