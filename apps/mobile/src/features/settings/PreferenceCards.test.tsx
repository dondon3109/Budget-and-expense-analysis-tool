import { fireEvent, render, screen } from "@testing-library/react-native";

import { useThemeStore } from "@/stores/theme-store";
import { useDailyReminderStore } from "@/stores/daily-reminder-store";
import { useVoiceLanguageStore } from "@/stores/voice-language-store";
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

describe("PreferenceCards", () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: "coffee" });
    useVoiceLanguageStore.setState({ language: "fil" });
    useDailyReminderStore.setState({ time: "off", restored: true });
  });

  it("folds both pickers to their current choice", async () => {
    await render(<PreferenceCards />);

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
});
