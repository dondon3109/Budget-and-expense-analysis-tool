import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { useSessionSnapshot } from "@/auth/session-state";

import { AccountPromptHost } from "./AccountPromptHost";
import { useAccountPromptStore } from "./account-prompt-store";
import { useAccountGate } from "./use-account-gate";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/auth/session-state", () => ({ useSessionSnapshot: jest.fn() }));

function withStatus(status: "guest" | "signed-in"): void {
  jest
    .mocked(useSessionSnapshot)
    .mockReturnValue({ status } as unknown as ReturnType<typeof useSessionSnapshot>);
}

describe("account gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAccountPromptStore.getState().close();
  });

  it("opens the sign-in prompt for a guest instead of the feature", async () => {
    withStatus("guest");
    const { result } = await renderHook(() => useAccountGate());

    await act(async () => result.current.openFeature("assistant", "/(app)/assistant"));

    expect(router.push).not.toHaveBeenCalled();
    expect(useAccountPromptStore.getState().feature).toBe("assistant");
  });

  it("lets a signed-in account through untouched", async () => {
    withStatus("signed-in");
    const { result } = await renderHook(() => useAccountGate());

    await act(async () => result.current.openFeature("assistant", "/(app)/assistant"));

    expect(router.push).toHaveBeenCalledWith("/(app)/assistant");
    expect(useAccountPromptStore.getState().feature).toBeNull();
  });

  it("names the feature and the account benefits, and sends the guest to sign in", async () => {
    useAccountPromptStore.getState().open("receipt-scan");
    await render(<AccountPromptHost />);

    expect(screen.getByText(/Receipt scanning needs a Zoption account/)).toBeTruthy();
    expect(screen.getByText(/Back up your data and sync it/)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(router.push).toHaveBeenCalledWith("/(public)/sign-in");
    expect(useAccountPromptStore.getState().feature).toBeNull();
  });
});
