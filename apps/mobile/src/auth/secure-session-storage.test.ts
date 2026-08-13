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

import { secureSessionStorage } from "./secure-session-storage";

describe("SecureStore-backed Supabase session storage", () => {
  beforeEach(() => mockValues.clear());

  it("round-trips a session larger than a single Keychain value", async () => {
    const session = JSON.stringify({ access_token: "x".repeat(5_000), refresh_token: "refresh" });
    await secureSessionStorage.setItem("auth", session);
    await expect(secureSessionStorage.getItem("auth")).resolves.toBe(session);
    expect(mockValues.has("auth.chunk.2")).toBe(true);
  });

  it("fails closed when an interrupted write leaves a missing chunk", async () => {
    await secureSessionStorage.setItem("auth", "x".repeat(4_000));
    mockValues.delete("auth.chunk.1");
    await expect(secureSessionStorage.getItem("auth")).resolves.toBeNull();
  });

  it("removes all encrypted chunks with the session", async () => {
    await secureSessionStorage.setItem("auth", "x".repeat(4_000));
    await secureSessionStorage.removeItem("auth");
    expect([...mockValues.keys()].filter((key) => key.startsWith("auth"))).toEqual([]);
  });
});
