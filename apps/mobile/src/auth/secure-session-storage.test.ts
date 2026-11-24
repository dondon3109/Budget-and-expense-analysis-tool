const mockValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "after-first-unlock-this-device-only",
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

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { secureSessionStorage, withSessionRemovalAllowed } from "./secure-session-storage";

describe("SecureStore-backed Supabase session storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValues.clear();
  });

  it("round-trips a session larger than a single Keychain value", async () => {
    const session = JSON.stringify({ access_token: "x".repeat(5_000), refresh_token: "refresh" });
    await secureSessionStorage.setItem("auth", session);
    await expect(secureSessionStorage.getItem("auth")).resolves.toBe(session);
    expect(mockValues.has("auth.s0.chunk.2")).toBe(true);
  });

  it("keeps the previous session intact if a refresh write is interrupted mid-chunk", async () => {
    const first = JSON.stringify({ access_token: "a".repeat(4_000), refresh_token: "first" });
    const second = JSON.stringify({ access_token: "b".repeat(4_000), refresh_token: "second" });
    await secureSessionStorage.setItem("auth", first);

    jest
      .mocked(SecureStore.setItemAsync)
      .mockImplementationOnce((key: string, value: string) => {
        mockValues.set(key, value);
        return Promise.resolve();
      })
      .mockImplementationOnce(() => Promise.reject(new Error("interrupted write")));

    await expect(secureSessionStorage.setItem("auth", second)).rejects.toThrow("interrupted write");
    await expect(secureSessionStorage.getItem("auth")).resolves.toBe(first);

    await secureSessionStorage.setItem("auth", second);
    await expect(secureSessionStorage.getItem("auth")).resolves.toBe(second);
    expect([...mockValues.keys()].filter((key) => key.startsWith("auth.s0."))).toEqual([]);
    expect(mockValues.has("auth.s1.chunk.0")).toBe(true);
  });

  it("fails closed when an interrupted write leaves a missing chunk", async () => {
    await secureSessionStorage.setItem("auth", "x".repeat(4_000));
    mockValues.delete("auth.s0.chunk.1");
    await expect(secureSessionStorage.getItem("auth")).resolves.toBeNull();
  });

  it("removes all encrypted chunks with the session", async () => {
    await secureSessionStorage.setItem("auth", "x".repeat(4_000));
    await secureSessionStorage.removeItem("auth");
    expect([...mockValues.keys()].filter((key) => key.startsWith("auth"))).toEqual([]);
  });

  it("keeps an Android session until a sign-out allows the delete", async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    try {
      await secureSessionStorage.setItem("auth", "x".repeat(4_000));
      await secureSessionStorage.removeItem("auth");
      expect(await secureSessionStorage.getItem("auth")).toBe("x".repeat(4_000));

      await withSessionRemovalAllowed(async () => {
        await secureSessionStorage.removeItem("auth");
      });
      expect([...mockValues.keys()].filter((key) => key.startsWith("auth"))).toEqual([]);
    } finally {
      Object.defineProperty(Platform, "OS", { configurable: true, value: originalOs });
    }
  });
});
