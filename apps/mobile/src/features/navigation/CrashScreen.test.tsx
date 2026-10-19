import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { CrashScreen } from "./CrashScreen";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

describe("CrashScreen", () => {
  const dev = __DEV__;
  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    jest.clearAllMocks();
  });

  it("explains the failure without the raw error outside development", async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    await render(<CrashScreen error={new Error("SQLITE_CORRUPT")} retry={jest.fn()} />);

    expect(screen.getByRole("header", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.queryByText("SQLITE_CORRUPT")).toBeNull();
  });

  it("retries in place, or moves to Home before retrying", async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    await render(<CrashScreen error={new Error("boom")} retry={retry} />);

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Go to Home" }));
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
