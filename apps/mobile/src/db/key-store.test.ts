const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureValues.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockSecureValues.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockSecureValues.delete(key);
    return Promise.resolve();
  }),
}));

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
  digestStringAsync: jest.fn(() => Promise.resolve("a".repeat(64))),
  getRandomBytesAsync: jest.fn(() => Promise.resolve(Uint8Array.from({ length: 32 }, (_, i) => i))),
}));

import * as SecureStore from "expo-secure-store";
import { getOrCreateWorkspaceKey, LocalKeyError, workspaceKeyAlias } from "./key-store";

describe("SQLCipher workspace key storage", () => {
  beforeEach(() => {
    mockSecureValues.clear();
    jest.clearAllMocks();
  });

  it("generates a 256-bit key once and reuses the protected value", async () => {
    const alias = "a".repeat(64);
    const first = await getOrCreateWorkspaceKey(alias);
    const second = await getOrCreateWorkspaceKey(alias);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(workspaceKeyAlias(alias)).not.toContain("supabase-user-id");
  });

  it("fails closed instead of replacing a corrupted protected key", async () => {
    const alias = "b".repeat(64);
    mockSecureValues.set(workspaceKeyAlias(alias), "not-a-valid-key");

    await expect(getOrCreateWorkspaceKey(alias)).rejects.toBeInstanceOf(LocalKeyError);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
