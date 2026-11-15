import { render, waitFor } from "@testing-library/react-native";
import { requireOptionalNativeModule } from "expo";
import { router } from "expo-router";

import { SharedReceiptHandoff, takeSharedReceipt } from "./SharedReceiptHandoff";

const mockRequireAccount = jest.fn(() => true);

jest.mock("expo", () => ({ requireOptionalNativeModule: jest.fn() }));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: () => ({ key: "root" }),
}));

jest.mock("@/features/account-prompt/use-account-gate", () => ({
  useAccountGate: () => ({ requireAccount: mockRequireAccount }),
}));

const shared = {
  uri: "file:///data/user/0/site.zoption/cache/zoption-shared-receipts/shared-1.png",
  fileName: "shared-1.png",
  mimeType: "image/png",
  width: 1080,
  height: 3021,
};

function intake(result: unknown) {
  const module = { consumeSharedReceiptAsync: jest.fn(async () => result) };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(module);
  return module;
}

describe("SharedReceiptHandoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAccount.mockReturnValue(true);
    takeSharedReceipt();
  });

  it("opens the scanner with a shared screenshot and hands it over once", async () => {
    intake(shared);
    await render(<SharedReceiptHandoff />);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(app)/receipt-scan"));
    expect(takeSharedReceipt()).toEqual(shared);
    expect(takeSharedReceipt()).toBeNull();
  });

  it("ignores anything that is not a private image copy", async () => {
    intake({ ...shared, uri: "content://evil/file" });
    await render(<SharedReceiptHandoff />);

    await waitFor(() => expect(requireOptionalNativeModule).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
    expect(takeSharedReceipt()).toBeNull();
  });

  it("shows the sign-in prompt to a guest instead of the scanner", async () => {
    mockRequireAccount.mockReturnValue(false);
    const module = intake(shared);
    await render(<SharedReceiptHandoff />);

    await waitFor(() => expect(module.consumeSharedReceiptAsync).toHaveBeenCalled());
    expect(mockRequireAccount).toHaveBeenCalledWith("receipt-scan");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does nothing where the native module is missing", async () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    await render(<SharedReceiptHandoff />);
    expect(router.push).not.toHaveBeenCalled();
  });
});
