import * as SecureStore from "expo-secure-store";

const mockValues = new Map<string, string>();
const mockReadDeviceBootCount = jest.fn<Promise<number>, []>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockValues.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockValues.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockValues.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock("@/db/local-data-security", () => ({
  readDeviceBootCount: () => mockReadDeviceBootCount(),
}));

import { Platform } from "react-native";

import {
  ANDROID_BOOT_COUNT_KEY,
  clearAndroidBootCount,
  readAndroidBootCount,
  readStoredAndroidBootCount,
  rememberAndroidBootCount,
  sessionEndedWithDeviceBoot,
} from "./android-boot-session";

describe("Android boot session", () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    mockValues.clear();
    mockReadDeviceBootCount.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: originalOs });
  });

  it("ends a session only when both boot counts are known and differ", () => {
    expect(sessionEndedWithDeviceBoot(null, null)).toBe(false);
    expect(sessionEndedWithDeviceBoot(null, 4)).toBe(false);
    expect(sessionEndedWithDeviceBoot(4, null)).toBe(false);
    expect(sessionEndedWithDeviceBoot(4, 4)).toBe(false);
    expect(sessionEndedWithDeviceBoot(4, 5)).toBe(true);
  });

  it("reads the current Android boot count and ignores an unreadable one", async () => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
    await expect(readAndroidBootCount()).resolves.toBeNull();
    expect(mockReadDeviceBootCount).not.toHaveBeenCalled();

    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    mockReadDeviceBootCount.mockResolvedValueOnce(7);
    await expect(readAndroidBootCount()).resolves.toBe(7);

    mockReadDeviceBootCount.mockRejectedValueOnce(new Error("unavailable"));
    await expect(readAndroidBootCount()).resolves.toBeNull();
  });

  it("round-trips a stored boot count and rejects a corrupt one", async () => {
    expect(await readStoredAndroidBootCount()).toBeNull();
    await rememberAndroidBootCount(12);
    expect(mockValues.get(ANDROID_BOOT_COUNT_KEY)).toBe("12");
    expect(await readStoredAndroidBootCount()).toBe(12);

    mockValues.set(ANDROID_BOOT_COUNT_KEY, "nope");
    expect(await readStoredAndroidBootCount()).toBeNull();

    await clearAndroidBootCount();
    expect(mockValues.has(ANDROID_BOOT_COUNT_KEY)).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(ANDROID_BOOT_COUNT_KEY);
  });
});
