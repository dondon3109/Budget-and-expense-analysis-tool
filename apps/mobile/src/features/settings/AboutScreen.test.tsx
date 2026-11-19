import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import { isPlayDistribution } from "@/config/app-variant";

import { AboutScreen } from "./AboutScreen";

jest.mock("@/config/app-variant", () => ({ isPlayDistribution: jest.fn() }));
jest.mock("@/config/app-version", () => ({
  appVersionInfo: () => ({ version: "0.2.64-beta", build: "20364", source: "Google Play" }),
}));
// The APK updater owns native modules; its own suite covers it.
jest.mock("@/features/updates", () => ({ UpdateSettingsCard: () => null }));

describe("AboutScreen", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
  });

  it("shows the installed version and build", async () => {
    jest.mocked(isPlayDistribution).mockReturnValue(true);
    await render(<AboutScreen />);

    expect(screen.getByText("0.2.64-beta")).toBeTruthy();
    expect(screen.getByText("20364")).toBeTruthy();
  });

  it("checks for updates on the Play Store listing in the Play build", async () => {
    jest.mocked(isPlayDistribution).mockReturnValue(true);
    await render(<AboutScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Check for updates, Google Play" }));
    expect(Linking.openURL).toHaveBeenCalledWith("market://details?id=site.zoption.android");
  });

  it("leaves the update check to the APK updater in the sideloaded build", async () => {
    jest.mocked(isPlayDistribution).mockReturnValue(false);
    await render(<AboutScreen />);

    expect(screen.queryByRole("button", { name: /Check for updates/ })).toBeNull();
  });
});
