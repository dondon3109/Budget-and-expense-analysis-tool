import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView } from "react-native";

import {
  useDebts,
  useLocalWorkspace,
  useTransactionFormData,
  useTransactionPhoto,
} from "@/db/local-workspace-state";
import type { LocalWorkspace } from "@/db/workspace";
import { TransactionEditorScreen } from "./TransactionEditorScreen";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// Expose KeyboardAwareScrollView props and forward its ref to ScrollView for scrollTo checks.
jest.mock("react-native-keyboard-controller", () => {
  const { createElement, forwardRef } = jest.requireActual("react");
  const { ScrollView: RNScrollView } = jest.requireActual("react-native");
  const actualMock = jest.requireActual("react-native-keyboard-controller/jest");
  return {
    ...actualMock,
    KeyboardAwareScrollView: forwardRef((props: object, ref: unknown) =>
      createElement(RNScrollView, { ...props, ref, testID: "transaction-editor-scroll" }),
    ),
  };
});

jest.mock("expo-router", () => {
  const { createElement } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    router: { back: jest.fn(), push: jest.fn() },
    Stack: {
      Screen: ({
        options,
      }: {
        options: { headerLeft?: () => ReactNode; headerRight?: () => ReactNode };
      }) =>
        createElement(
          View,
          { testID: "stack-header" },
          options.headerLeft?.(),
          options.headerRight?.(),
        ),
    },
    useLocalSearchParams: jest.fn(),
  };
});

jest.mock("@/db/local-workspace-state", () => ({
  useDebts: jest.fn(),
  useLocalWorkspace: jest.fn(),
  useTransactionFormData: jest.fn(),
  useTransactionPhoto: jest.fn(),
}));

jest.mock("@/sync/sync-state", () => ({ useSyncState: () => ({ retry: jest.fn() }) }));
jest.mock("@/telemetry/telemetry", () => ({ telemetry: { capture: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: () => ({ subject: "me" }) }));
jest.mock("@/features/family/active-workspace", () => ({
  useActiveWorkspace: () => ({ family: null, writable: true, closesAt: null }),
}));
jest.mock("@/features/family/use-family-api", () => ({ useFamilyApi: () => null }));
jest.mock("@/features/family/use-family-receipt", () => ({
  saveFamilyReceipt: jest.fn(),
  useFamilyReceipt: () => null,
}));
jest.mock("@/features/sounds/sound-effects", () => ({
  playSound: jest.fn(),
  withTapSound: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
jest.mock("./TransactionPhotoField", () => ({ TransactionPhotoField: () => null }));
jest.mock("./EntryReveal", () => ({
  EntryReveal: ({ children }: { children: ReactNode }) => children,
}));

const updateTransaction = jest.fn(async () => undefined);
const createTransaction = jest.fn(async () => "tx-created");

describe("TransactionEditorScreen notes keyboard layout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLocalSearchParams).mockReturnValue({});
    jest
      .mocked(useDebts)
      .mockReturnValue({ debts: [], loading: false, error: null, retry: jest.fn() });
    jest.mocked(useTransactionPhoto).mockReturnValue({
      photo: null,
    });
    jest.mocked(useLocalWorkspace).mockReturnValue({
      workspace: {
        transactionMutations: {
          createTransaction,
          updateTransaction,
        },
      } as unknown as LocalWorkspace,
      status: "ready",
      message: null,
      retry: jest.fn(),
      reopen: jest.fn(),
    });
    jest.mocked(useTransactionFormData).mockReturnValue({
      data: {
        transaction: null,
        accounts: [
          {
            id: "acc-cash",
            name: "Cash",
            type: "cash",
            currency: "PHP",
            pending: false,
          },
        ],
        categories: [
          {
            id: "cat-uncategorized",
            name: "Uncategorized",
            kind: "expense",
            color: "#6b7280",
            iconEmoji: null,
            pending: false,
          },
        ],
        unavailableReason: null,
      },
      error: null,
      retry: jest.fn(),
    });
  });

  it("uses KeyboardAwareScrollView with notes clearance and saves directly from the header while editing notes", async () => {
    await render(<TransactionEditorScreen />);
    const scrollView = screen.getByTestId("transaction-editor-scroll");

    expect(scrollView.props.bottomOffset).toBeGreaterThanOrEqual(104);
    expect(scrollView.props.extraKeyboardSpace).toBeGreaterThanOrEqual(104);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe("handled");

    await fireEvent.changeText(screen.getByLabelText("Amount"), "120.50");
    await fireEvent.changeText(screen.getByLabelText("Notes"), "Lunch with team");
    await fireEvent.press(screen.getByRole("button", { name: "Save new expense" }));

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "expense",
          amountMinor: 12050,
          notes: "Lunch with team",
          description: "Lunch with team",
        }),
      ),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it("scrolls back to the top validation alert when saving fails while editing notes", async () => {
    const scrollToSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(jest.fn());
    try {
      await render(<TransactionEditorScreen />);

      await fireEvent.changeText(screen.getByLabelText("Notes"), "Forgot amount");
      await fireEvent.press(screen.getByRole("button", { name: "Save new expense" }));

      expect(await screen.findByText("Check the highlighted details.")).toBeTruthy();
      expect(createTransaction).not.toHaveBeenCalled();
      expect(scrollToSpy).toHaveBeenCalledWith({ y: 0, animated: true });
    } finally {
      scrollToSpy.mockRestore();
    }
  });
});
