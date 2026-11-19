import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import { AboutScreen } from "./AboutScreen";

jest.mock("@/config/app-version", () => ({
  appVersionInfo: () => ({ version: "0.2.64-beta", build: "20364", source: "Google Play" }),
}));

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
    await render(<AboutScreen />);

    expect(screen.getByText("0.2.64-beta")).toBeTruthy();
    expect(screen.getByText("20364")).toBeTruthy();
  });

  it("checks for updates on the Play Store listing on Android", async () => {
    await render(<AboutScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Check for updates, Google Play" }));
    expect(Linking.openURL).toHaveBeenCalledWith("market://details?id=site.zoption.android");
  });
});
