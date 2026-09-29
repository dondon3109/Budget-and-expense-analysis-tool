import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { updateWorkspaceSettings } from "@/api/workspace-settings";
import { useThemeStore } from "@/stores/theme-store";
import {
  useDailyReminderRestoredStore,
  useDailyReminderStore,
} from "@/stores/daily-reminder-store";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
import { useWorkspaceCurrencyStore } from "@/stores/workspace-currency-store";
import { PreferenceCards } from "./PreferenceCards";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-notifications", () => ({}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(),
}));

jest.mock("@react-native-community/netinfo", () => ({
  useNetInfo: () => ({ isInternetReachable: true, isConnected: true }),
}));
jest.mock("@/auth/session-state", () => ({
  useSessionSnapshot: () => ({ subject: "user-1", getAccessToken: async () => "token" }),
}));
jest.mock("@/api/workspace-settings", () => ({ updateWorkspaceSettings: jest.fn() }));

describe("PreferenceCards", () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: "coffee" });
    useWorkspaceCurrencyStore.setState({ currency: "PHP" });
    useVoiceLanguageStore.setState({ language: "fil" });
    useDailyReminderStore.setState({ time: "off" });
    useDailyReminderRestoredStore.setState({ restored: true });
  });

  it("folds both pickers to their current choice", async () => {
    await render(<PreferenceCards />);

    expect(screen.getByRole("button", { name: "Currency, Philippine Peso (PHP)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Theme, Coffee" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voice language, Tagalog" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("opens the voice language picker and updates the summary after a choice", async () => {
    await render(<PreferenceCards />);

    await fireEvent.press(screen.getByRole("button", { name: "Voice language, Tagalog" }));
    await fireEvent.press(screen.getByLabelText(/English, Optimized for English/));

    expect(useVoiceLanguageStore.getState().language).toBe("en");
    expect(screen.getByRole("button", { name: "Voice language, English" })).toBeTruthy();
  });

  it("saves a new workspace currency through the Worker", async () => {
    jest.mocked(updateWorkspaceSettings).mockResolvedValue({ currency: "USD" });
    await render(<PreferenceCards />);

    await fireEvent.press(screen.getByRole("button", { name: "Currency, Philippine Peso (PHP)" }));
    await fireEvent.press(screen.getByLabelText(/Workspace currency/));
    await fireEvent.press(screen.getByText("US Dollar (USD)"));

    expect(updateWorkspaceSettings).toHaveBeenCalledWith(
      { accessToken: "token" },
      { currency: "USD" },
    );
    await waitFor(() => expect(useWorkspaceCurrencyStore.getState().currency).toBe("USD"));
  });
});
