import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReceiptDraft } from "@zoption/shared";

import { extractReceipt } from "@/api/receipt-scan";
import { useLocalWorkspace, useTransactionFormData } from "@/db/local-workspace-state";
import type { TransactionFormData } from "@/db/view-models";
import type { LocalWorkspace } from "@/db/workspace";
import { useSyncState } from "@/sync/sync-state";
import { ReceiptScanScreen } from "./ReceiptScanScreen";

// Guards the e-wallet paths: a GCash screenshot pays from the GCash account with its reference
// in the notes, and a cash-in saves as one transfer with its fee.

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: "file:///gcash.jpg", fileName: "gcash.jpg", mimeType: "image/jpeg" }],
  })),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

jest.mock("@/api/receipt-scan", () => ({
  getReceiptPreferences: jest.fn(async () => ({
    enabled: true,
    consentedAt: "2026-08-01T00:00:00Z",
    consentVersion: 2,
    visionModel: "@cf/google/gemma-4-26b-a4b-it",
  })),
  grantReceiptConsent: jest.fn(),
  extractReceipt: jest.fn(),
}));

jest.mock("@/auth/session-state", () => {
  const session = { getAccessToken: jest.fn().mockResolvedValue("token") };
  return { useSessionSnapshot: () => session };
});

jest.mock("@/db/local-workspace-state", () => ({
  useLocalWorkspace: jest.fn(),
  useTransactionFormData: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({ useSyncState: jest.fn() }));

jest.mock("@/features/family/active-workspace", () => ({
  useActiveWorkspace: () => ({ family: null, writable: true }),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const createTransaction = jest.fn().mockResolvedValue("transfer-1");
const createTransactions = jest.fn().mockResolvedValue(["txn-1"]);

function category(id: string, name: string, kind: "income" | "expense" | "transfer") {
  return { id, name, kind, color: "#64748B", iconEmoji: null, pending: false };
}

function formData(): TransactionFormData {
  return {
    accounts: [
      { id: "a-bpi", name: "BPI Savings", type: "checking", currency: "PHP", pending: false },
      { id: "a-gcash", name: "GCash", type: "other", currency: "PHP", pending: false },
    ],
    categories: [
      category("c-uncat", "Uncategorized", "expense"),
      category("c-transfer", "Transfer", "transfer"),
    ],
    transaction: null,
    unavailableReason: null,
  };
}

const gcashSend: ReceiptDraft = {
  merchant: "JA•••N M•• L.",
  date: "2026-09-30",
  amountMinor: 240_000,
  currency: "PHP",
  kind: "expense",
  payment: {
    provider: "GCash",
    type: "send_money",
    counterparty: "JA•••N M•• L.",
    referenceNo: "2045596729825",
    feeMinor: 0,
  },
  rawText: "Sent via GCash",
};

async function scan(draft: ReceiptDraft): Promise<void> {
  jest.mocked(extractReceipt).mockResolvedValue(draft);
  await render(<ReceiptScanScreen />);
  await fireEvent.press(await screen.findByLabelText("Choose receipt photo from library"));
  await screen.findByText(/^Review /);
}

describe("ReceiptScanScreen payment confirmations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useSyncState)
      .mockReturnValue({ status: "synced", message: null, retry: jest.fn() });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: { createTransaction, createTransactions },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useTransactionFormData).mockReturnValue({
      data: formData(),
      error: null,
      retry: jest.fn(),
    });
  });

  it("saves a GCash Send Money screenshot from the GCash account with its reference", async () => {
    await scan(gcashSend);

    expect(screen.getByText("GCash · Send money · Ref 2045596729825 · Fee ₱0.00")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Save 1 scanned item"));

    await waitFor(() => expect(createTransactions).toHaveBeenCalledTimes(1));
    expect(createTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: "expense",
        accountId: "a-gcash",
        amountMinor: 240_000,
        date: "2026-09-30",
        description: "JA•••N M•• L.",
        notes: "Scanned receipt · GCash Send money · Ref 2045596729825",
        entryMethod: "receipt",
      }),
    ]);
  });

  it("saves a cash-in as one transfer into the wallet with its fee", async () => {
    await scan({
      ...gcashSend,
      merchant: "BPI",
      amountMinor: 101_500,
      kind: "transfer",
      payment: { provider: "GCash", type: "cash_in", feeMinor: 1_500 },
    });

    await fireEvent.press(screen.getByLabelText("Save scanned transfer"));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "transfer",
        fromAccountId: "a-bpi",
        toAccountId: "a-gcash",
        amountMinor: 101_500,
        transferFeeMinor: 1_500,
        categoryId: "c-transfer",
        entryMethod: "receipt",
      }),
    );
    expect(createTransactions).not.toHaveBeenCalled();
  });
});
