import { fireEvent, render, screen } from "@testing-library/react-native";

import type { ParsedSmsTransaction } from "@zoption/shared";

import { SmsQuickPasteModal } from "./SmsQuickPasteModal";

const GCASH_SMS =
  "You have paid PHP 250.00 of GCash to JOLLIBEE on 08/25/2026 14:30. Ref. No. 123456789";

async function parseFixture() {
  await render(<SmsQuickPasteModal visible onDismiss={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("SMS notification text"), GCASH_SMS);
  await fireEvent.press(screen.getByRole("button", { name: "Parse details" }));
}

describe("SmsQuickPasteModal", () => {
  it("parses pasted SMS text and shows the transaction details", async () => {
    await parseFixture();

    expect(screen.getByLabelText("Parsed transaction details")).toBeOnTheScreen();
    expect(screen.getByLabelText(/Philippine pesos/)).toBeOnTheScreen();
    expect(screen.getByText("JOLLIBEE")).toBeOnTheScreen();
    expect(screen.getByText("gcash")).toBeOnTheScreen();
    expect(screen.getByText("2026-08-25 · 14:30")).toBeOnTheScreen();
    expect(screen.getByText("Food & Dining")).toBeOnTheScreen();
    expect(screen.getByText("123456789")).toBeOnTheScreen();
  });

  it("explains when the pasted text cannot be recognized", async () => {
    await render(<SmsQuickPasteModal visible onDismiss={jest.fn()} />);

    await fireEvent.changeText(screen.getByLabelText("SMS notification text"), "hello there");
    await fireEvent.press(screen.getByRole("button", { name: "Parse details" }));

    expect(screen.getByRole("alert")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Parsed transaction details")).not.toBeOnTheScreen();
  });

  it("auto-pastes the SMS text from the clipboard", async () => {
    await render(
      <SmsQuickPasteModal
        visible
        onDismiss={jest.fn()}
        readClipboard={async () => GCASH_SMS}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Auto-Paste from Clipboard" }));

    expect(screen.getByDisplayValue(GCASH_SMS)).toBeOnTheScreen();
  });

  it("hands the parsed draft to the editor when applied", async () => {
    const onApply = jest.fn();
    await render(<SmsQuickPasteModal visible onDismiss={jest.fn()} onApply={onApply} />);
    await fireEvent.changeText(screen.getByLabelText("SMS notification text"), GCASH_SMS);
    await fireEvent.press(screen.getByRole("button", { name: "Parse details" }));

    await fireEvent.press(screen.getByRole("button", { name: "Use in transaction editor" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const parsed: ParsedSmsTransaction = onApply.mock.calls[0]?.[0];
    expect(parsed.amountMinor).toBe(25_000);
    expect(parsed.payeeOrMerchant).toBe("JOLLIBEE");
    expect(parsed.channel).toBe("gcash");
    expect(parsed.date).toBe("2026-08-25");
    expect(parsed.suggestedCategory).toBe("Food & Dining");
    expect(parsed.referenceNumber).toBe("123456789");
  });
});
