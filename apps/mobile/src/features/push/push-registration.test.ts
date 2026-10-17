import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerPushDevice, unregisterPushDevice } from "@/api/push";

import { registerForPush, unregisterForPush } from "./push-registration";

jest.mock("@/api/push", () => ({
  registerPushDevice: jest.fn(async () => undefined),
  unregisterPushDevice: jest.fn(async () => undefined),
}));

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

function configure(projectId: string | undefined, granted: boolean) {
  Constants.expoConfig!.extra = projectId ? { eas: { projectId } } : {};
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted } as never);
}

describe("push registration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, "OS", "android");
  });

  it("does nothing in a build without push credentials", async () => {
    configure(undefined, true);

    expect(await registerForPush("access")).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("never asks for permission, and skips registration without a grant", async () => {
    configure("project-1", false);

    expect(await registerForPush("access")).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it("registers the Expo token and removes it again on sign-out", async () => {
    configure("project-1", true);

    expect(await registerForPush("access")).toBe("ExponentPushToken[test]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(registerPushDevice).toHaveBeenCalledWith(
      { accessToken: "access" },
      { token: "ExponentPushToken[test]", platform: "android" },
    );

    await unregisterForPush("access");
    await unregisterForPush("access");
    expect(unregisterPushDevice).toHaveBeenCalledTimes(1);
    expect(unregisterPushDevice).toHaveBeenCalledWith(
      { accessToken: "access", timeoutMs: 5_000 },
      "ExponentPushToken[test]",
    );
  });
});
