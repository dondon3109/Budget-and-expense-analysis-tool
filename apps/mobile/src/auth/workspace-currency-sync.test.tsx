import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { ApiTransportError } from "@/api/authenticated";
import { getWorkspaceSettings } from "@/api/workspace-settings";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { useSessionSnapshot } from "./session-state";
import { useWorkspaceCurrencySync } from "./workspace-currency-sync";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => () => undefined),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("@/api/workspace-settings", () => ({ getWorkspaceSettings: jest.fn() }));
jest.mock("./session-state", () => ({ useSessionSnapshot: jest.fn() }));
jest.mock("@/features/family/active-workspace", () => ({
  useActiveWorkspace: () => ({ family: null, writable: true }),
}));

const getSettings = getWorkspaceSettings as jest.Mock;
const getSession = useSessionSnapshot as jest.Mock;

function Probe({ enabled = true }: { enabled?: boolean }) {
  useWorkspaceCurrencySync(enabled);
  return null;
}

describe("useWorkspaceCurrencySync", () => {
  let onChange: ((state: string) => void) | undefined;
  let onNetInfo: ((state: NetInfoState) => void) | undefined;

  beforeEach(() => {
    jest.spyOn(AppState, "addEventListener").mockImplementation(((
      _type: string,
      listener: (state: string) => void,
    ) => {
      onChange = listener;
      return { remove: jest.fn() };
    }) as never);
    jest
      .mocked(NetInfo.addEventListener)
      .mockReset()
      .mockImplementation((listener) => {
        onNetInfo = listener;
        return () => undefined;
      });
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

  it("waits until enabled before fetching and retries 401 with a refreshed token", async () => {
    const getAccessToken = jest.fn(async (refresh: boolean) => (refresh ? "fresh" : "stale"));
    getSession.mockReturnValue({ status: "signed-in", subject: "user-1", getAccessToken });
    getSettings
      .mockRejectedValueOnce(new ApiTransportError("expired", "session_expired", 401))
      .mockResolvedValueOnce({ currency: "JPY" });

    const view = await render(<Probe enabled={false} />);
    await act(async () => {});
    expect(getSettings).not.toHaveBeenCalled();

    await view.rerender(<Probe enabled />);
    await waitFor(() => expect(useWorkspaceCurrencyStore.getState().currency).toBe("JPY"));
    expect(getAccessToken).toHaveBeenNthCalledWith(1, false);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, true);
  });

  it("retries on NetInfo reconnect after an offline failure", async () => {
    getSettings
      .mockRejectedValueOnce(new ApiTransportError("offline", "network", 0))
      .mockResolvedValueOnce({ currency: "USD" });

    await render(<Probe />);
    await act(async () => {});
    expect(getSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      onNetInfo?.({ isConnected: true, isInternetReachable: true } as NetInfoState);
    });
    await waitFor(() => expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD"));
    expect(getSettings).toHaveBeenCalledTimes(2);
  });
});
