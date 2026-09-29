import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";

import { getWorkspaceSettings } from "@/api/workspace-settings";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useSessionSnapshot } from "./session-state";
import { useWorkspaceCurrencySync } from "./workspace-currency-sync";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("@/api/workspace-settings", () => ({ getWorkspaceSettings: jest.fn() }));
jest.mock("./session-state", () => ({ useSessionSnapshot: jest.fn() }));

const getSettings = getWorkspaceSettings as jest.Mock;
const getSession = useSessionSnapshot as jest.Mock;

function Probe() {
  useWorkspaceCurrencySync();
  return null;
}

describe("useWorkspaceCurrencySync", () => {
  let onChange: ((state: string) => void) | undefined;

  beforeEach(() => {
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _type: string,
      listener: (state: string) => void,
    ) => {
      onChange = listener;
      return { remove: jest.fn() };
    }) as never);
    getSettings.mockReset().mockResolvedValue({ currency: "PHP" });
    getSession.mockReturnValue({
      status: "signed-in",
      subject: "user-1",
      getAccessToken: jest.fn(async () => "token"),
    });
    useWorkspaceCurrencyStore.setState({ currency: "PHP" });
  });

  afterEach(() => jest.restoreAllMocks());

  it("re-reads the setting when the app returns to the foreground", async () => {
    await render(<Probe />);
    await act(async () => {});
    expect(getSettings).toHaveBeenCalledTimes(1);

    getSettings.mockResolvedValue({ currency: "USD" });
    await act(async () => onChange?.("background"));
    expect(getSettings).toHaveBeenCalledTimes(1);
    await act(async () => onChange?.("active"));
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD");
  });

  it("keeps the cached currency when a foreground refresh fails", async () => {
    await render(<Probe />);
    await act(async () => {});
    getSettings.mockRejectedValue(new Error("offline"));
    await act(async () => onChange?.("active"));
    expect(useWorkspaceCurrencyStore.getState().currency).toBe("PHP");
  });
});
